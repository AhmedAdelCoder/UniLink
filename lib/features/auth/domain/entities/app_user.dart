import 'package:equatable/equatable.dart';

import 'user_project.dart';

enum UserRole { student, recruiter }

class AppUser extends Equatable {
  final String id;
  final String email;
  final String fullName;
  final UserRole role;
  final String? photoUrl;
  final String bio;
  final List<String> skills;
  final List<UserProject> projects;
  final String? githubUrl;
  final String? linkedinUrl;
  final String? websiteUrl;
  final bool isOnline;
  final DateTime? lastSeen;

  const AppUser({
    required this.id,
    required this.email,
    required this.fullName,
    required this.role,
    this.photoUrl,
    this.bio = '',
    this.skills = const [],
    this.projects = const [],
    this.githubUrl,
    this.linkedinUrl,
    this.websiteUrl,
    this.isOnline = false,
    this.lastSeen,
  });

  @override
  List<Object?> get props => [
        id,
        email,
        fullName,
        role,
        photoUrl,
        bio,
        skills,
        projects,
        githubUrl,
        linkedinUrl,
        websiteUrl,
        isOnline,
        lastSeen,
      ];
}
