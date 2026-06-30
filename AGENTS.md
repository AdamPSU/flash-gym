---
title: Flash Gym agent instructions
status: active
created: 2026-06-30
updated: 2026-06-30
scope: repository
---

# Flash Gym agent instructions

This repository is for a hackathon project built with Runpod Flash. Before coding, read the files under `contexts/` and treat them as the current project memory.

## Hard constraints

- Use Runpod Flash for cloud execution.
- Do not use regular Runpod Serverless worker setup, Runpod Pods, manual Dockerfiles, or custom image workflows unless the user explicitly changes this constraint.
- Do not define the final system architecture until the context research supports it.
- Keep the current pipeline idea as a project seed, not a committed design.
- Do not commit secrets, API keys, tokens, credentials, local environment files, or downloaded model weights.
- Do not expose private user video, generated keyframes, labels, masks, or training data unless the user asks for that specific artifact.

## Knowledge base workflow

- Add durable notes to `contexts/` when new project facts appear.
- Prefer direct team notes and verified Runpod Flash documentation over guesses.
- Mark uncertain claims as open questions instead of filling gaps.
- Keep context files concise enough to scan during a hackathon.
- Update `contexts/sources.md` when adding a new external source.

## Writing rules

- Use YAML frontmatter at the top of markdown files created for project context.
- Use markdown for the body.
- Do not use bold or italics in project context files.
- Do not use em dashes or en dashes.
- Use straight quotes.
- Prefer direct language over promotional or inflated language.

## Engineering rules

- Make the smallest change that moves the sprint forward.
- Check existing context before adding code, dependencies, or new files.
- Keep implementation choices reversible until the pipeline and deployment constraints are clear.
- Prefer explicit names for endpoints, stages, files, and dataset artifacts.
- Write tests or validation scripts when behavior becomes concrete.
- Document commands that affect cloud resources before running them.

## Runpod Flash reminders

- Flash marks remote functions with `@Endpoint`.
- Endpoint code runs on Runpod workers. Local orchestration code runs locally during development.
- Imports for endpoint dependencies belong inside the decorated function body.
- Flash apps are deployed with `flash deploy` and can be tested with `flash dev`.
- Flash deployment artifacts have a size limit, so large models and generated artifacts need careful handling.
- Network volumes mount at `/runpod-volume/` and may be relevant for model or dataset persistence.

## Current project seed

The rough idea is to turn a user submitted venue video into a supervised dataset by extracting valid keyframes, adding realistic hazards, segmenting hazards, labeling affordance and risk, and exporting COCO plus JSONL outputs. This is not yet an architecture.

The current known deployment constraint is serverless execution through Flash without reloading huge models from scratch for every request. The workaround is intentionally undecided.
