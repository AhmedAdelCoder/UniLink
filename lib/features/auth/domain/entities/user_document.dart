import 'package:equatable/equatable.dart';

class UserDocument extends Equatable {
  final String id;
  final String name;
  final String url;
  final String? description;
  final DateTime uploadedAt;

  const UserDocument({
    required this.id,
    required this.name,
    required this.url,
    this.description,
    required this.uploadedAt,
  });

  @override
  List<Object?> get props => [id, name, url, description, uploadedAt];
}