# Azure Resource Group Module

This Terraform module creates an Azure resource group with standard tags. It is the foundation for every Azure deployment in the platform.

## Usage

```hcl
module "rg" {
  source   = "./modules/tf-azurerm-resource-group"
  name     = "rg-myproject-prod"
  location = "westeurope"
  tags = {
    environment = "production"
    team        = "platform"
    managed-by  = "terraform"
  }
}
```

## Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `name` | string | (required) | Resource group name. Must follow the naming convention `rg-<project>-<env>`. |
| `location` | string | `westeurope` | Azure region. We default to West Europe for GDPR compliance. |
| `tags` | map(string) | (required) | Resource tags. Must include `environment`, `team`, and `managed-by`. |

## Outputs

| Name | Description |
|------|-------------|
| `name` | The resource group name |
| `id` | The resource group Azure resource ID |
| `location` | The Azure region |

## Naming Convention

All resource groups must follow this pattern:

```
rg-<project>-<environment>
```

Examples:
- `rg-invoice-api-prod`
- `rg-shared-services-dev`
- `rg-data-platform-staging`

## Tagging Policy

Every resource group must have these tags:

- `environment`: `dev`, `staging`, or `production`
- `team`: the owning team (e.g., `platform`, `backend`, `data`)
- `managed-by`: always `terraform`

Optional tags:
- `cost-center`: for billing allocation
- `expiry-date`: for temporary resource groups (format: `YYYY-MM-DD`)

## Dependencies

This module has no dependencies on other modules. It is always the first module deployed.

## Change Management

Changes to resource groups in production require a CAB approval. The module itself is low-risk, but renaming or deleting a resource group destroys all resources inside it.

**Before changing a production resource group:**

1. Check what resources exist inside it (`az resource list --resource-group <name>`)
2. Create a change request in the platform
3. Get CAB approval
4. Apply with `terraform plan` first, review the output
5. Apply with `terraform apply`

## Retry Policy

Terraform retries Azure API calls automatically. If you get a 429 (rate limited), wait 60 seconds and retry. The Azure provider handles most transient errors.

For long-running deployments, set the timeout:

```hcl
resource "azurerm_resource_group" "this" {
  name     = var.name
  location = var.location
  tags     = var.tags

  timeouts {
    create = "5m"
    delete = "10m"
  }
}
```
