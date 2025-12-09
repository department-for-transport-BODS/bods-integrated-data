variable "environment" {
  type        = string
  description = "Environment"
}

variable "nptg_retriever_function_arn" {
  type = string
}

variable "nptg_uploader_function_arn" {
  type = string
}

variable "noc_retriever_function_arn" {
  type = string
}

variable "noc_processor_function_arn" {
  type = string
}

variable "bods_txc_retriever_function_arn" {
  type = string
}

variable "tnds_txc_retriever_function_arn" {
  type = string
}

variable "unzipper_function_arn" {
  type = string
}

variable "txc_processor_function_arn" {
  type = string
}

variable "gtfs_timetables_trip_table_creator_function_arn" {
  type = string
}

variable "gtfs_timetables_england_trip_table_creator_function_arn" {
  type = string
}

variable "gtfs_timetables_generator_function_arn" {
  type = string
}

variable "gtfs_timetables_zipper_function_arn" {
  type = string
}

variable "gtfs_timetables_trip_mapper_function_arn" {
  type = string
}

variable "db_cleardown_function_arn" {
  type = string
}

variable "table_renamer_function_arn" {
  type = string
}

variable "naptan_retriever_function_arn" {
  type = string
}

variable "naptan_uploader_function_arn" {
  type = string
}

variable "bank_holidays_retriever_function_arn" {
  type = string
}

variable "bods_txc_zipped_bucket_name" {
  type = string
}

variable "tnds_txc_zipped_bucket_name" {
  type = string
}

variable "bods_txc_bucket_name" {
  type = string
}

variable "tfl_txc_bucket_name" {
  type = string
}

variable "tnds_txc_bucket_name" {
  type = string
}

variable "noc_bucket_name" {
  type = string
}

variable "naptan_bucket_name" {
  type = string
}

variable "nptg_bucket_name" {
  type = string
}

variable "bods_netex_retriever_function_arn" {
  type = string
}

variable "bods_netex_unzipper_function_arn" {
  type = string
}

variable "bods_netex_zipped_bucket_name" {
  type = string
}

variable "bods_netex_bucket_name" {
  type = string
}

variable "schedule" {
  type        = string
  description = "Cron schedule to trigger the step function"
  nullable    = true
  default     = null
}

variable "tfl_txc_sfn_arn" {
  type = string
}

variable "tfl_txc_sfn_name" {
  type = string
}
