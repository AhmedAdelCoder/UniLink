import 'package:equatable/equatable.dart';

class UserEducation extends Equatable {
  final String school;
  final String degree;
  final String fieldOfStudy;
  final DateTime? startDate;
  final DateTime? endDate;
  final String? description;

  const UserEducation({
    required this.school,
    required this.degree,
    required this.fieldOfStudy,
    this.startDate,
    this.endDate,
    this.description,
  });

  @override
  List<Object?> get props =>
      [school, degree, fieldOfStudy, startDate, endDate, description];
}