import 'package:equatable/equatable.dart';

class UserProject extends Equatable {
  final String title;
  final String description;
  final String? link;

  const UserProject({
    required this.title,
    this.description = '',
    this.link,
  });

  @override
  List<Object?> get props => [title, description, link];
}
