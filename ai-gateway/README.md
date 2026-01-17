# Bifrost AI Gateway

Deploys Bifrost v1.3.63 which includes Gemini 3.0 thought signature support.

## Deploy

```bash
fly launch
fly volume create bifrost_data --size 10
fly deploy
```

## Configure Providers

Set environment variables or use config file at `/app/data/config.yaml`:

```yaml
providers:
  google:
    api_key: "your-google-api-key"
  openai:
    api_key: "your-openai-api-key"
  anthropic:
    api_key: "your-anthropic-api-key"

gateways:
  - name: "default"
    provider: "google"
    models:
      - name: "gemini-3.0-flash"
        defaults:
          enable_thought_signature: true
```

## Usage

Once deployed, access at `https://nirmanus-bifrost-gateway.fly.dev/v1`

Example with OpenAI client:
```python
import openai
client = openai.OpenAI(
    base_url="https://nirmanus-bifrost-gateway.fly.dev/v1",
    api_key="your-google-api-key"
)
response = client.chat.completions.create(
    model="gemini-3.0-flash",
    messages=[{"role": "user", "content": "Hello"}]
)
```
