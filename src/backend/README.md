# Backend

## Upload a demo video to the Runpod volume

Set Runpod S3 compatible API credentials in the environment before uploading. These are Runpod S3 credentials, not an AWS bucket.

```bash
export RUNPOD_S3_ACCESS_KEY_ID="..."
export RUNPOD_S3_SECRET_ACCESS_KEY="..."
PYTHONPATH=src/backend .venv/bin/python -m flash_gym.runpod_volume_upload runpod-venue.mov --job-id runpod-venue --volume-id 37wxu5itek --datacenter-id US-CA-2
```

The command prints the worker path to pass into Flash:

```text
/runpod-volume/jobs/runpod-venue/input/video.mov
```
