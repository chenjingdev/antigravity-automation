---
name: image-save
description: If the user request has a JSON key where type === "image", follow the rules to save the output correctly.
---

# Image Save Workflow

## Rules
- Even if the user does not explicitly request image generation, if the type contains "image", prioritize this and generate the image most relevant to the user's request.
- After image generation completes, save the output into `images/`.
- Set the filename to the jobid.
- Always use the `.png` extension.
