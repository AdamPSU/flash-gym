---
title: Runpod Flash context
status: active
created: 2026-06-30
updated: 2026-06-30
source_type: docs
---

# Runpod Flash context

Runpod Flash is the required cloud execution path for this project.

## Verified basics

- Flash is a Python SDK for defining hardware, remote functions, and dependencies in local code.
- A function decorated with `@Endpoint` runs remotely on Runpod Serverless infrastructure.
- Code outside the decorated endpoint keeps local control flow during local development.
- Flash can use GPU or CPU endpoints.
- Flash supports queue based endpoints for batch and async work.
- Flash supports load balanced endpoints for HTTP APIs with routes such as `POST /process` and `GET /health`.
- Each unique endpoint `name` creates or updates a separate Serverless endpoint.
- Queue based deployed endpoints use `/runsync` for synchronous calls and `/run` for async jobs.
- Load balanced endpoints share one endpoint URL with multiple routes.

## Setup and commands

- Install with `pip install runpod-flash` or `uv tool install runpod-flash`.
- Authenticate with `flash login` or provide `RUNPOD_API_KEY` through the environment.
- Use `flash dev` for local development with remote endpoint execution.
- Use `flash dev --auto-provision` to provision endpoints before the first test request.
- Use `flash build` to build an artifact without deploying.
- Use `flash deploy` to build and deploy a Flash app.
- Use `flash deploy --preview` for a local Docker based preview before cloud deployment.

## Endpoint configuration facts

- `workers` accepts either a max worker count or a `(min, max)` tuple.
- `workers=(0, n)` allows scale to zero and lowers idle cost.
- `workers=(1, n)` keeps one worker warm and can reduce cold starts.
- `idle_timeout` controls how long an idle worker stays active before scaling down.
- `dependencies` lists Python packages to install for the remote worker.
- Endpoint package imports must happen inside the decorated function body.
- `system_dependencies` can install apt packages.
- `execution_timeout_ms` should be set when jobs have a known upper bound.
- `flashboot` is enabled by default and is intended to speed startup.
- `python_version` can be set on endpoint configs or through CLI flags.

## Deployment facts

- Flash apps package code, dependencies, a manifest, and generated handler code into a tarball.
- Flash uses prebuilt Flash Docker images and extracts the tarball at runtime.
- Normal Flash app deployment does not require the project to write a Dockerfile.
- Runpod Serverless has a 1.5 GB deployment artifact limit for Flash deployments.
- Flash auto excludes some base image packages from artifacts, including torch, torchvision, torchaudio, numpy, and triton in documented cases.
- Python 3.12 has no extra GPU cold start overhead in the docs because PyTorch is preinstalled in the base image.
- Python 3.10, 3.11, and 3.13 can add roughly 7 GB of GPU cold start overhead in documented cases.
- All resources in one Flash app must use the same Python version.

## Storage facts

- Flash workers have container disk and network volume storage.
- Container disk is temporary and is erased when the worker stops.
- Network volumes persist across worker restarts.
- Network volumes mount at `/runpod-volume/`.
- Network volumes may be used for large models, shared data, and generated artifacts.
- Each network volume is tied to a specific datacenter.
- Multi datacenter deployments need one volume per datacenter.
- Only one network volume is allowed per datacenter.

## Cold start facts

- Cold starts happen on first endpoint call, after all workers scale down, or when all running workers are busy.
- A cold start provisions a worker, starts the worker image, then executes the function.
- Typical cold start timing in docs is 10 to 60 seconds, with other docs giving 20 to 90 seconds depending on configuration.
- Warm starts route the job to an already running idle worker and are typically about 1 second plus function time.
- `flash build` and `flash deploy` preinstall dependencies into the worker image layer, avoiding pip install at request time.
- Standalone scripts can install dependencies at request time.

## Documentation links

- https://docs.runpod.io/flash/overview
- https://docs.runpod.io/flash/quickstart
- https://docs.runpod.io/flash/create-endpoints
- https://docs.runpod.io/flash/execution-model
- https://docs.runpod.io/flash/apps/local-testing
- https://docs.runpod.io/flash/apps/deploy-apps
- https://docs.runpod.io/flash/apps/apps-and-environments
- https://docs.runpod.io/flash/configuration/best-practices
- https://docs.runpod.io/flash/configuration/storage
- https://docs.runpod.io/flash/configuration/parameters
