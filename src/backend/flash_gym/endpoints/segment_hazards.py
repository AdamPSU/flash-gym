from runpod_flash import DataCenter, Endpoint, GpuGroup, NetworkVolume, PodTemplate

from flash_gym.sam3_segmentation_contract import build_sam3_endpoint_env


phase3_volume = NetworkVolume(
    name="flash-gym-artifacts",
    size=100,
    datacenter=DataCenter.US_CA_2,
)


@Endpoint(
    name="segment-hazards",
    gpu=GpuGroup.AMPERE_80,
    datacenter=DataCenter.US_CA_2,
    volume=phase3_volume,
    workers=(0, 1),
    idle_timeout=1200,
    execution_timeout_ms=3600000,
    template=PodTemplate(containerDiskInGb=100),
    dependencies=[
        "accelerate",
        "huggingface_hub",
        "numpy>=1.26,<2",
        "pillow",
        "safetensors",
        "timm>=1.0.17",
        "transformers>=4.57.3",
    ],
    env=build_sam3_endpoint_env(),
)
async def segment_hazards(input_data: dict) -> dict:
    from contextlib import contextmanager
    from pathlib import Path
    import json
    import threading
    import time

    from flash_gym.sam3_segmentation_contract import (
        DEFAULT_MODEL_CACHE_DIR,
        DEFAULT_MODEL_ID,
        Sam3SegmentationRequest,
        build_sam3_segmentation_manifest,
        build_sam3_segmentation_paths,
        select_approved_edited_images,
        validate_volume_path,
    )

    endpoint_started_at = time.time()

    def emit_progress(
        progress_path: str | None,
        phase: str,
        status: str,
        started_at: float,
        **details,
    ) -> None:
        record = {
            "schema_version": 1,
            "stage": "hazard-segmentation",
            "phase": phase,
            "status": status,
            "elapsed_seconds": round(time.time() - started_at, 3),
            "timestamp_unix": round(time.time(), 3),
            **details,
        }
        print(f"flash-gym-progress {json.dumps(record, sort_keys=True)}", flush=True)
        if progress_path is None:
            return
        try:
            progress_file = Path(progress_path)
            progress_file.parent.mkdir(parents=True, exist_ok=True)
            progress_file.write_text(json.dumps(record, indent=2), encoding="utf-8")
        except Exception as error:
            print(f"flash-gym-progress-write-error {type(error).__name__}: {error}", flush=True)

    @contextmanager
    def observed_phase(
        progress_path: str | None,
        phase: str,
        heartbeat_seconds: int,
        **details,
    ):
        phase_started_at = time.time()
        stopped = threading.Event()

        def heartbeat() -> None:
            while not stopped.wait(heartbeat_seconds):
                emit_progress(progress_path, phase, "running", phase_started_at, **details)

        emit_progress(progress_path, phase, "started", phase_started_at, **details)
        heartbeat_thread = threading.Thread(target=heartbeat, daemon=True)
        heartbeat_thread.start()
        try:
            yield
        except Exception as error:
            stopped.set()
            heartbeat_thread.join(timeout=1)
            emit_progress(
                progress_path,
                phase,
                "failed",
                phase_started_at,
                error_type=type(error).__name__,
                error=str(error),
                **details,
            )
            raise
        else:
            stopped.set()
            heartbeat_thread.join(timeout=1)
            emit_progress(progress_path, phase, "completed", phase_started_at, **details)

    def ensure_sam3_model(
        model_id: str,
        model_cache_dir: str,
        progress_path: str | None,
        heartbeat_seconds: int,
    ):
        from transformers import Sam3Model, Sam3Processor

        global _sam3_model
        global _sam3_model_id
        global _sam3_model_cache_dir
        global _sam3_processor

        if (
            "_sam3_model" in globals()
            and "_sam3_processor" in globals()
            and _sam3_model_id == model_id
            and _sam3_model_cache_dir == model_cache_dir
        ):
            emit_progress(
                progress_path,
                "model_cache_hit",
                "completed",
                endpoint_started_at,
                model_id=model_id,
                model_cache_dir=model_cache_dir,
            )
            return _sam3_model, _sam3_processor

        Path(model_cache_dir).mkdir(parents=True, exist_ok=True)
        with observed_phase(
            progress_path,
            "model_load",
            heartbeat_seconds,
            model_id=model_id,
            model_cache_dir=model_cache_dir,
        ):
            model = Sam3Model.from_pretrained(
                model_id,
                cache_dir=model_cache_dir,
                device_map="auto",
                token=True,
            )
            processor = Sam3Processor.from_pretrained(
                model_id,
                cache_dir=model_cache_dir,
                token=True,
            )
            model.eval()

        _sam3_model = model
        _sam3_processor = processor
        _sam3_model_id = model_id
        _sam3_model_cache_dir = model_cache_dir
        return model, processor

    heartbeat_seconds = max(5, int(input_data.get("heartbeat_seconds", 15)))
    mode = input_data.get("mode", "segment")
    if mode == "warmup":
        model_id = str(input_data.get("model_id") or DEFAULT_MODEL_ID)
        model_cache_dir = str(input_data.get("model_cache_dir") or DEFAULT_MODEL_CACHE_DIR)
        progress_path = str(
            input_data.get("progress_path") or Path(model_cache_dir) / "warmup_progress.json"
        )
        validate_volume_path(model_cache_dir)
        validate_volume_path(progress_path)
        emit_progress(
            progress_path,
            "warmup_request_received",
            "completed",
            endpoint_started_at,
            model_id=model_id,
            model_cache_dir=model_cache_dir,
        )
        ensure_sam3_model(model_id, model_cache_dir, progress_path, heartbeat_seconds)
        emit_progress(progress_path, "warmup_ready", "completed", endpoint_started_at, model_id=model_id)
        return {
            "status": "ready",
            "mode": "warmup",
            "model_id": model_id,
            "model_cache_dir": model_cache_dir,
            "progress_path": progress_path,
            "elapsed_seconds": round(time.time() - endpoint_started_at, 3),
        }

    approved_frame_ids = tuple(input_data.get("approved_frame_ids") or ())
    job_id = input_data.get("job_id")
    if not isinstance(job_id, str):
        raise ValueError("job_id must be a safe file-system slug")
    paths = build_sam3_segmentation_paths(job_id)
    progress_path = str(input_data.get("progress_path") or paths.progress_path)
    validate_volume_path(progress_path)
    request = Sam3SegmentationRequest(
        job_id=job_id,
        edit_manifest_path=str(
            input_data.get("edit_manifest_path") or paths.edit_manifest_path
        ),
        approved_frame_ids=approved_frame_ids,
        concept_prompt=str(input_data.get("concept_prompt") or ""),
        max_images=int(input_data.get("max_images", 30)),
        batch_size=int(input_data.get("batch_size", 4)),
        score_threshold=float(input_data.get("score_threshold", 0.5)),
        mask_threshold=float(input_data.get("mask_threshold", 0.5)),
        model_id=str(input_data.get("model_id") or DEFAULT_MODEL_ID),
        model_cache_dir=str(input_data.get("model_cache_dir") or DEFAULT_MODEL_CACHE_DIR),
    )

    emit_progress(
        progress_path,
        "segmentation_request_validated",
        "completed",
        endpoint_started_at,
        job_id=request.job_id,
        approved_count=len(request.approved_frame_ids),
        max_images=request.max_images,
        batch_size=request.batch_size,
    )

    edit_manifest_path = Path(request.edit_manifest_path)
    edit_manifest = json.loads(edit_manifest_path.read_text(encoding="utf-8"))
    selected_images = select_approved_edited_images(
        edit_manifest,
        approved_frame_ids=request.approved_frame_ids,
        max_images=request.max_images,
    )

    masks_dir = Path(paths.masks_dir)
    masks_dir.mkdir(parents=True, exist_ok=True)
    for previous_mask in masks_dir.glob("*_mask_*.png"):
        previous_mask.unlink()

    model, processor = ensure_sam3_model(
        request.model_id,
        request.model_cache_dir,
        progress_path,
        heartbeat_seconds,
    )

    import torch
    from PIL import Image

    def tensor_item(value) -> float:
        if hasattr(value, "detach"):
            return float(value.detach().cpu().item())
        return float(value)

    def tensor_list(value) -> list[float]:
        if hasattr(value, "detach"):
            value = value.detach().cpu()
        if hasattr(value, "tolist"):
            return value.tolist()
        return list(value)

    def write_binary_mask(mask, mask_path: Path) -> int:
        if hasattr(mask, "detach"):
            mask_tensor = mask.detach().cpu()
        else:
            mask_tensor = torch.as_tensor(mask)
        binary_mask = mask_tensor > 0
        area_pixels = int(binary_mask.sum().item())
        mask_image = Image.fromarray(binary_mask.to(dtype=torch.uint8).mul(255).numpy())
        mask_image.save(mask_path)
        return area_pixels

    segmentation_images = []
    batch_count = (len(selected_images) + request.batch_size - 1) // request.batch_size
    device = getattr(model, "device", None) or ("cuda" if torch.cuda.is_available() else "cpu")
    for batch_index, start in enumerate(range(0, len(selected_images), request.batch_size), start=1):
        chunk = selected_images[start : start + request.batch_size]
        pil_images = []
        image_sizes = []
        try:
            for image_record in chunk:
                image = Image.open(Path(image_record["edited_path"])).convert("RGB")
                image_sizes.append(image.size)
                pil_images.append(image)

            with observed_phase(
                progress_path,
                "image_segmentation_batch",
                heartbeat_seconds,
                job_id=request.job_id,
                batch_index=batch_index,
                batch_count=batch_count,
                image_count=len(chunk),
            ):
                inputs = processor(
                    images=pil_images,
                    text=[request.concept_prompt] * len(pil_images),
                    return_tensors="pt",
                ).to(device)
                target_sizes = inputs.get("original_sizes")
                if hasattr(target_sizes, "tolist"):
                    target_sizes = target_sizes.tolist()
                with torch.no_grad():
                    outputs = model(**inputs)
                results = processor.post_process_instance_segmentation(
                    outputs,
                    threshold=request.score_threshold,
                    mask_threshold=request.mask_threshold,
                    target_sizes=target_sizes,
                )

            for source_record, image_size, result in zip(chunk, image_sizes, results):
                frame_id = source_record["frame_id"]
                width, height = image_size
                masks = result.get("masks", [])
                boxes = result.get("boxes", [])
                scores = result.get("scores", [])
                instances = []
                for instance_index in range(len(masks)):
                    instance_id = f"{frame_id}_mask_{instance_index + 1:02d}"
                    mask_path = masks_dir / f"{instance_id}.png"
                    area_pixels = write_binary_mask(masks[instance_index], mask_path)
                    instances.append(
                        {
                            "instance_id": instance_id,
                            "mask_path": str(mask_path),
                            "bbox_xyxy": [
                                round(float(value), 3)
                                for value in tensor_list(boxes[instance_index])[:4]
                            ],
                            "score": round(tensor_item(scores[instance_index]), 6),
                            "area_pixels": area_pixels,
                        }
                    )

                image_manifest_record = {
                    "frame_id": frame_id,
                    "edited_path": source_record["edited_path"],
                    "width": width,
                    "height": height,
                    "instances": instances,
                }
                if "source_path" in source_record:
                    image_manifest_record["source_path"] = source_record["source_path"]
                if "timestamp_ms" in source_record:
                    image_manifest_record["timestamp_ms"] = source_record["timestamp_ms"]
                segmentation_images.append(image_manifest_record)
        finally:
            for image in pil_images:
                image.close()

    manifest = build_sam3_segmentation_manifest(
        job_id=request.job_id,
        model_id=request.model_id,
        concept_prompt=request.concept_prompt,
        source_manifest_path=request.edit_manifest_path,
        images=segmentation_images,
    )
    manifest.update(
        {
            "status": "segmented" if manifest["instance_count"] else "no-instances-found",
            "max_images": request.max_images,
            "batch_size": request.batch_size,
            "score_threshold": request.score_threshold,
            "mask_threshold": request.mask_threshold,
            "model_cache_dir": request.model_cache_dir,
            "progress_path": progress_path,
            "elapsed_seconds": round(time.time() - endpoint_started_at, 3),
        }
    )

    manifest_path = Path(paths.manifest_path)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    emit_progress(
        progress_path,
        "segmentation_manifest_written",
        "completed",
        endpoint_started_at,
        job_id=request.job_id,
        manifest_path=str(manifest_path),
        segmented_count=manifest["segmented_count"],
        instance_count=manifest["instance_count"],
    )

    return {
        "job_id": request.job_id,
        "status": manifest["status"],
        "manifest_path": str(manifest_path),
        "masks_dir": str(masks_dir),
        "model_id": request.model_id,
        "segmented_count": manifest["segmented_count"],
        "instance_count": manifest["instance_count"],
        "progress_path": progress_path,
    }
