variable "environment" {
  type        = string
  description = "Environment"
}

variable "function_name" {
  type     = string
  nullable = false
}

variable "zip_path" {
  type     = string
  nullable = false
}

variable "permissions" {
  type        = any
  nullable    = true
  default     = null
  description = "Permissions to apply to lambda function"
}

variable "handler" {
  type     = string
  nullable = true
}

variable "runtime" {
  type     = string
  nullable = true
}

variable "timeout" {
  type     = number
  nullable = false
}

variable "memory" {
  type     = number
  nullable = false
}

variable "ephemeral_storage" {
  type     = number
  nullable = true
  default  = null
}

variable "env_vars" {
  type        = map(string)
  nullable    = true
  default     = null
  description = "Map of environment variables"
}

variable "log_level" {
  type        = string
  default     = "info"
  description = "Pino log level for the function, set as the LOG_LEVEL environment variable"

  validation {
    condition     = contains(["trace", "debug", "info", "warn", "error", "fatal"], var.log_level)
    error_message = "log_level must be one of: trace, debug, info, warn, error, fatal."
  }
}

variable "needs_db_access" {
  type    = bool
  default = false
}

variable "needs_vpc_access" {
  type    = bool
  default = false
}

variable "vpc_id" {
  type        = string
  nullable    = true
  default     = null
  description = "ID of the VPC, if a VPC lambda is required"
}

variable "subnet_ids" {
  type        = list(string)
  nullable    = true
  default     = null
  description = "List of subnet IDs to use for a VPC lambda"
}

variable "database_sg_id" {
  type        = string
  nullable    = true
  default     = null
  description = "ID of the Database security group, if the lambda needs access to it"
}

variable "schedule" {
  type        = string
  nullable    = true
  default     = null
  description = "Provide cron schedule or rate to trigger the lambda on a schedule"
}

variable "s3_bucket_trigger" {
  type        = map(string)
  nullable    = true
  default     = null
  description = "ID and ARN of the bucket which will trigger the function when new objects are uploaded"
}

variable "reserved_concurrency" {
  type        = number
  nullable    = true
  default     = null
  description = "Reserved concurrency for lambda"
}

variable "architectures" {
  type        = list(string)
  default     = ["arm64"]
  description = "Arhcitectures to use for lambda function"
}

variable "custom_sg_id" {
  type        = string
  default     = null
  description = "ID of a custom VPC security group"
}

variable "retry_attempts" {
  type        = number
  nullable    = true
  default     = null
  description = "Maximum number of retry attempts."
}

variable "deploy_as_container_lambda" {
  type        = bool
  default     = false
  description = "Whether to deploy as a container lambda"
}
