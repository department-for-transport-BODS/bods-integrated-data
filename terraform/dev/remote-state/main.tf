terraform {
  required_version = ">= 1.6.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.97"
    }
  }
}

module "tf-state-dev" {
  source = "../../modules/bootstrap/tf-state"

  environment = local.env
}

locals {
  bucket_name         = "integrated-data-tfstate-dev"
  dynamodb_table_name = "integrated-data-state-lock-dev"
  env                 = "dev"
}
