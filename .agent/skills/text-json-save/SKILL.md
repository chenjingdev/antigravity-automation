---
name: text-json-save
description: If the user request has a JSON key where type === "text", follow the rules to save the output correctly.
---

# Text Save Workflow

## Rules

- Even if the user does not explicitly request text generation, if the type includes "text", prioritize that request and generate the text most relevant to the user's request.
- Once text generation is complete, save the output to the `texts/` folder.
- Set the filename to the job ID.
- Always use the `.md` extension.
