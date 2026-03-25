terraform {
  required_version = ">= 1.8"

  required_providers {
    ${{ values.cloud }} = {
      source  = "hashicorp/${{ values.cloud }}"
      version = "~> 4.0"
    }
  }
}
