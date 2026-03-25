# ${{ values.name }}

${{ values.description }}

## Usage

```hcl
module "${{ values.name }}" {
  source = "github.com/victorZKov/${{ values.name }}"

  tags = {
    environment = "staging"
    project     = "my-project"
    managed-by  = "terraform"
  }
}
```

## Inputs

| Name | Type | Required | Description |
|------|------|----------|-------------|
| tags | map(string) | yes | Resource tags |

## Outputs

| Name | Description |
|------|-------------|
