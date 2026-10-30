variable "environment" {
  type        = string
  description = "Environment"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of Subnet IDs"
}

variable "db_sg_id" {
  type        = string
  description = "Database Security Group ID"
}

variable "db_host" {
  type = string
}

variable "db_port" {
  type    = number
  default = 5432
}

variable "db_secret_arn" {
  type        = string
  description = "ARN of the secret containing the database credentials"
}

variable "db_name" {
  type    = string
  default = "bods_integrated_data"
}

variable "calendar_required_percentage" {
  type    = number
  default = 70
}

variable "calendar_date_required_percentage" {
  type    = number
  default = 70
}

variable "stop_required_percentage" {
  type    = number
  default = 70
}

variable "shape_required_percentage" {
  type    = number
  default = 70
}

variable "trip_required_percentage" {
  type    = number
  default = 70
}

variable "frequency_required_percentage" {
  type    = number
  default = 70
}

variable "stop_time_required_percentage" {
  type    = number
  default = 70
}
