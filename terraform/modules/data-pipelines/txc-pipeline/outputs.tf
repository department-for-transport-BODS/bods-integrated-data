output "gtfs_timetables_bucket_name" {
  value = aws_s3_bucket.integrated_data_gtfs_timetables_bucket.id
}

output "bods_txc_zipped_bucket_name" {
  value = aws_s3_bucket.integrated_data_bods_txc_zipped_bucket.id
}

output "tnds_txc_zipped_bucket_name" {
  value = aws_s3_bucket.integrated_data_tnds_txc_zipped_bucket.id
}

output "bods_txc_bucket_name" {
  value = aws_s3_bucket.integrated_data_bods_txc_bucket.id
}

output "tnds_txc_bucket_name" {
  value = aws_s3_bucket.integrated_data_tnds_txc_bucket.id
}

output "bods_txc_retriever_function_arn" {
  value = module.integrated_data_bods_txc_retriever_function.function_arn
}

output "tnds_txc_retriever_function_arn" {
  value = module.integrated_data_tnds_txc_retriever_function.function_arn
}

output "unzipper_function_arn" {
  value = module.integrated_data_unzipper_function.function_arn
}

output "txc_processor_function_arn" {
  value = module.integrated_data_txc_processor_function.function_arn
}

output "gtfs_timetables_trip_table_creator_function_arn" {
  value = module.integrated_data_gtfs_trip_table_creator_function.function_arn
}

output "gtfs_timetables_england_trip_table_creator_function_arn" {
  value = module.integrated_data_gtfs_england_trip_table_creator_function.function_arn
}

output "gtfs_timetables_generator_function_arn" {
  value = module.integrated_data_gtfs_timetables_generator_function.function_arn
}

output "gtfs_timetables_zipper_function_arn" {
  value = module.integrated_data_gtfs_timetables_zipper_function.function_arn
}

output "gtfs_timetables_trip_mapper_function_arn" {
  value = module.integrated_data_gtfs_timetables_trip_mapper_function.function_arn
}

output "gtfs_trip_maps_table_name" {
  value = module.integrated_data_gtfs_trip_maps_table.table_name
}
