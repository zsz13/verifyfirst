# Local secret files

Anything you drop in this directory is mounted read-only into the containers that
need it, at `/run/secrets/verifyfirst`. Use it when you would rather not put a
credential in `.env`.

One credential per file, the value only, no quotes and no trailing text. Name the
file after the environment variable, lowercased:

| File              | Replaces environment variable |
| ----------------- | ----------------------------- |
| `ipqs_api_key`    | `IPQS_API_KEY`                |
| `model_api_key`   | `MODEL_API_KEY`               |
| `openai_api_key`  | `OPENAI_API_KEY`              |
| `daytona_api_key` | `DAYTONA_API_KEY`             |
| `trueforge_token` | `TRUEFORGE_TOKEN`             |

```bash
printf '%s' 'your-key-here' > secrets/ipqs_api_key
chmod 600 secrets/ipqs_api_key
```

A file here wins over the matching environment variable. Absent files are normal:
the integration is simply reported as not configured. Every file except this README
is git-ignored — never commit a real credential.

On Linux the file must be readable by uid 1000 (the container user). If it is not,
VerifyFirst says so explicitly instead of failing silently.
