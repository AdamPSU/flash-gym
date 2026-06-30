from runpod_flash import DataCenter, Endpoint, GpuGroup, NetworkVolume, PodTemplate


phase2_volume = NetworkVolume(
    name="flash-gym-artifacts",
    size=100,
    datacenter=DataCenter.US_CA_2,
)


@Endpoint(
    name="edit-hazards",
    gpu=[GpuGroup.ADA_48_PRO, GpuGroup.AMPERE_48],
    datacenter=DataCenter.US_CA_2,
    volume=phase2_volume,
    workers=(0, 1),
    idle_timeout=1200,
    execution_timeout_ms=3600000,
    template=PodTemplate(containerDiskInGb=100),
    dependencies=[
        "accelerate",
        "git+https://github.com/huggingface/diffusers.git",
        "huggingface_hub",
        "pillow",
        "safetensors",
        "sentencepiece",
        "transformers",
    ],
    env={
        "HF_HOME": "/runpod-volume/.cache/huggingface",
        "HF_HUB_CACHE": "/runpod-volume/.cache/huggingface/hub",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    },
)
async def edit_hazards(input_data: dict) -> dict:
    from contextlib import contextmanager
    from pathlib import Path
    import json
    import re
    import threading
    import time

    DEFAULT_MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
    DEFAULT_MODEL_CACHE_DIR = "/runpod-volume/models/flux2-klein-4b"
    VOLUME_ROOT = "/runpod-volume"
    FRAME_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")
    JOB_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")

    endpoint_started_at = time.time()

    def validate_job_id(job_id: str) -> None:
        if not JOB_ID_PATTERN.fullmatch(job_id):
            raise ValueError("job_id must be a safe file-system slug")

    def validate_frame_id(frame_id: str) -> None:
        if not FRAME_ID_PATTERN.fullmatch(frame_id):
            raise ValueError("frame_id must be a safe file-system slug")

    def validate_volume_path(path: str) -> None:
        resolved = Path(path)
        if not resolved.is_absolute():
            raise ValueError(f"path must be absolute under {VOLUME_ROOT}")
        try:
            resolved.relative_to(Path(VOLUME_ROOT))
        except ValueError as error:
            raise ValueError(f"path must be under {VOLUME_ROOT}") from error

    def build_hazard_edit_paths(job_id: str) -> dict[str, str]:
        validate_job_id(job_id)
        root = Path(VOLUME_ROOT) / "jobs" / job_id
        return {
            "keyframe_manifest_path": str(root / "keyframes_manifest.json"),
            "edited_dir": str(root / "edited"),
            "manifest_path": str(root / "edit_manifest.json"),
            "progress_path": str(root / "edit_progress.json"),
        }

    def select_approved_frames(
        keyframe_manifest: dict,
        approved_frame_ids: tuple[str, ...],
        max_images: int,
    ) -> list[dict]:
        if max_images < 1:
            raise ValueError("max_images must be at least 1")
        if not approved_frame_ids:
            raise ValueError("approved_frame_ids cannot be empty")

        approved = set()
        for frame_id in approved_frame_ids:
            validate_frame_id(frame_id)
            approved.add(frame_id)

        matching = []
        seen = set()
        for frame in keyframe_manifest.get("frames", []):
            frame_id = frame.get("frame_id")
            if frame_id not in approved:
                continue
            validate_frame_id(frame_id)
            validate_volume_path(frame["path"])
            matching.append(frame)
            seen.add(frame_id)

        missing = approved - seen
        if missing:
            missing_list = ", ".join(sorted(missing))
            raise ValueError(f"approved frames were not found in keyframe manifest: {missing_list}")

        return matching[:max_images]

    def build_hazard_edit_manifest(
        job_id: str,
        model_id: str,
        prompt: str,
        source_manifest_path: str,
        images: list[dict],
    ) -> dict:
        validate_job_id(job_id)
        validate_volume_path(source_manifest_path)
        if not prompt.strip():
            raise ValueError("prompt cannot be empty")
        for image in images:
            validate_frame_id(image["frame_id"])
            validate_volume_path(image["source_path"])
            validate_volume_path(image["edited_path"])
        return {
            "schema_version": 1,
            "stage": "hazard-edit",
            "job_id": job_id,
            "model_id": model_id,
            "prompt": prompt,
            "source_manifest_path": source_manifest_path,
            "edited_count": len(images),
            "images": images,
        }

    def emit_progress(
        progress_path: str | None,
        phase: str,
        status: str,
        started_at: float,
        **details,
    ) -> None:
        record = {
            "schema_version": 1,
            "stage": "hazard-edit",
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
        except Exception as error:  # Keep telemetry failure from hiding the real model stage.
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

    def resize_for_vram(image, max_dimension: int):
        from PIL import Image

        width, height = image.size
        largest_dimension = max(width, height)
        if largest_dimension <= max_dimension:
            return image
        scale = max_dimension / largest_dimension
        resized_size = (max(1, round(width * scale)), max(1, round(height * scale)))
        return image.resize(resized_size, Image.Resampling.LANCZOS)

    def ensure_flux2_klein_pipeline(
        model_id: str,
        model_cache_dir: str,
        progress_path: str | None,
        heartbeat_seconds: int,
    ):
        import torch
        from diffusers.pipelines.flux2.pipeline_flux2_klein import Flux2KleinPipeline
        from huggingface_hub import snapshot_download

        global _flux2_klein_pipeline
        global _flux2_klein_model_id
        global _flux2_klein_model_cache_dir

        if (
            "_flux2_klein_pipeline" in globals()
            and _flux2_klein_model_id == model_id
            and _flux2_klein_model_cache_dir == model_cache_dir
        ):
            emit_progress(
                progress_path,
                "pipeline_cache_hit",
                "completed",
                endpoint_started_at,
                model_id=model_id,
                model_cache_dir=model_cache_dir,
            )
            return _flux2_klein_pipeline

        Path(model_cache_dir).mkdir(parents=True, exist_ok=True)
        with observed_phase(
            progress_path,
            "model_download",
            heartbeat_seconds,
            model_id=model_id,
            model_cache_dir=model_cache_dir,
        ):
            snapshot_path = snapshot_download(repo_id=model_id, cache_dir=model_cache_dir)
        with observed_phase(
            progress_path,
            "pipeline_load",
            heartbeat_seconds,
            model_id=model_id,
            snapshot_path=snapshot_path,
        ):
            pipeline = Flux2KleinPipeline.from_pretrained(
                snapshot_path,
                torch_dtype=torch.bfloat16,
                local_files_only=True,
            )
        with observed_phase(progress_path, "pipeline_cuda", heartbeat_seconds, model_id=model_id):
            pipeline.to("cuda")
        pipeline.set_progress_bar_config(disable=True)
        _flux2_klein_pipeline = pipeline
        _flux2_klein_model_id = model_id
        _flux2_klein_model_cache_dir = model_cache_dir
        return pipeline

    heartbeat_seconds = max(5, int(input_data.get("heartbeat_seconds", 15)))
    mode = input_data.get("mode", "edit")
    if mode == "diagnostics":
        import torch

        return {
            "status": "ready",
            "mode": "diagnostics",
            "model_id": str(input_data.get("model_id") or DEFAULT_MODEL_ID),
            "cuda_available": torch.cuda.is_available(),
            "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
            "gpu_memory_gb": round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2)
            if torch.cuda.is_available()
            else None,
        }
    if mode == "warmup":
        model_id = str(input_data.get("model_id") or DEFAULT_MODEL_ID)
        model_cache_dir = str(input_data.get("model_cache_dir") or DEFAULT_MODEL_CACHE_DIR)
        progress_path = str(input_data.get("progress_path") or Path(model_cache_dir) / "warmup_progress.json")
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
        ensure_flux2_klein_pipeline(model_id, model_cache_dir, progress_path, heartbeat_seconds)
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
    validate_job_id(job_id)
    paths = build_hazard_edit_paths(job_id)
    progress_path = str(input_data.get("progress_path") or paths["progress_path"])
    validate_volume_path(progress_path)
    keyframe_manifest_path_value = str(input_data.get("keyframe_manifest_path") or paths["keyframe_manifest_path"])
    prompt = str(input_data.get("prompt") or "")
    max_images = int(input_data.get("max_images", 30))
    seed_base = int(input_data.get("seed", 0))
    num_inference_steps = int(input_data.get("num_inference_steps", 4))
    true_cfg_scale = float(input_data.get("true_cfg_scale", 4.0))
    guidance_scale = float(input_data.get("guidance_scale", 1.0))
    negative_prompt = str(input_data.get("negative_prompt", " "))
    model_id = str(input_data.get("model_id") or DEFAULT_MODEL_ID)
    model_cache_dir = str(input_data.get("model_cache_dir") or DEFAULT_MODEL_CACHE_DIR)
    max_dimension = int(input_data.get("max_dimension", 768))

    validate_volume_path(keyframe_manifest_path_value)
    validate_volume_path(model_cache_dir)
    if not prompt.strip():
        raise ValueError("prompt cannot be empty")
    if max_images < 1:
        raise ValueError("max_images must be at least 1")
    if num_inference_steps < 1:
        raise ValueError("num_inference_steps must be at least 1")
    if max_dimension < 1:
        raise ValueError("max_dimension must be at least 1")
    if not approved_frame_ids:
        raise ValueError("approved_frame_ids cannot be empty")
    for frame_id in approved_frame_ids:
        validate_frame_id(frame_id)

    emit_progress(
        progress_path,
        "edit_request_validated",
        "completed",
        endpoint_started_at,
        job_id=job_id,
        approved_count=len(approved_frame_ids),
        max_images=max_images,
        max_dimension=max_dimension,
    )
    keyframe_manifest_path = Path(keyframe_manifest_path_value)
    keyframe_manifest = json.loads(keyframe_manifest_path.read_text(encoding="utf-8"))
    selected_frames = select_approved_frames(
        keyframe_manifest,
        approved_frame_ids=approved_frame_ids,
        max_images=max_images,
    )

    edited_dir = Path(paths["edited_dir"])
    edited_dir.mkdir(parents=True, exist_ok=True)
    for previous_image in edited_dir.glob("*_hazard.png"):
        previous_image.unlink()

    pipeline = ensure_flux2_klein_pipeline(model_id, model_cache_dir, progress_path, heartbeat_seconds)

    import torch
    from PIL import Image

    images = []
    for index, frame in enumerate(selected_frames):
        frame_id = frame["frame_id"]
        source_path = Path(frame["path"])
        edited_path = edited_dir / f"{frame_id}_hazard.png"
        seed = seed_base + index
        generator = torch.Generator(device="cuda").manual_seed(seed)
        source_image = Image.open(source_path).convert("RGB")
        source_image = resize_for_vram(source_image, max_dimension)
        inputs = {
            "image": source_image,
            "prompt": prompt,
            "generator": generator,
            "height": source_image.height,
            "width": source_image.width,
            "guidance_scale": guidance_scale,
            "num_inference_steps": num_inference_steps,
        }
        image_started_at = time.time()
        with observed_phase(
            progress_path,
            "image_edit",
            heartbeat_seconds,
            job_id=job_id,
            frame_id=frame_id,
            image_index=index + 1,
            image_count=len(selected_frames),
        ):
            with torch.inference_mode():
                output = pipeline(**inputs)
        output_image = output.final_images[0] if hasattr(output, "final_images") else output.images[0]
        output_image.save(edited_path)

        image_record = {
            "frame_id": frame_id,
            "source_path": str(source_path),
            "edited_path": str(edited_path),
            "seed": seed,
            "elapsed_seconds": round(time.time() - image_started_at, 3),
        }
        if "timestamp_ms" in frame:
            image_record["timestamp_ms"] = frame["timestamp_ms"]
        images.append(image_record)
        source_image.close()

    manifest = build_hazard_edit_manifest(
        job_id=job_id,
        model_id=model_id,
        prompt=prompt,
        source_manifest_path=keyframe_manifest_path_value,
        images=images,
    )
    manifest.update(
        {
            "status": "edited" if images else "no-images-edited",
            "max_images": max_images,
            "num_inference_steps": num_inference_steps,
            "true_cfg_scale": true_cfg_scale,
            "guidance_scale": guidance_scale,
            "negative_prompt": negative_prompt,
            "model_cache_dir": model_cache_dir,
            "max_dimension": max_dimension,
            "progress_path": progress_path,
            "elapsed_seconds": round(time.time() - endpoint_started_at, 3),
        }
    )

    manifest_path = Path(paths["manifest_path"])
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    emit_progress(
        progress_path,
        "edit_manifest_written",
        "completed",
        endpoint_started_at,
        job_id=job_id,
        manifest_path=str(manifest_path),
        edited_count=len(images),
    )

    return {
        "job_id": job_id,
        "status": manifest["status"],
        "manifest_path": str(manifest_path),
        "edited_dir": str(edited_dir),
        "model_id": model_id,
        "edited_count": len(images),
        "progress_path": progress_path,
    }
