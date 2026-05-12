import 'dart:io';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../domain/entities/app_user.dart';
import '../../domain/entities/user_project.dart';
import '../../../../core/services/cloudinary_service.dart';

class AppUserModel extends AppUser {
  const AppUserModel({
    required super.id,
    required super.email,
    required super.fullName,
    required super.role,
    super.photoUrl,
    super.bio,
    super.skills,
    super.projects,
    super.githubUrl,
    super.linkedinUrl,
    super.websiteUrl,
    super.cvUrl,
    super.isOnline,
    super.lastSeen,
  });


  static List<UserProject> _parseProjects(dynamic raw) {
    if (raw is! List) return const [];

    return raw
        .map((e) {
          if (e is Map<String, dynamic>) {
            return UserProject(
              title: (e['title'] as String?) ?? '',
              description: (e['description'] as String?) ?? '',
              link: e['link'] as String?,
            );
          }
          return null;
        })
        .whereType<UserProject>()
        .toList();
  }


  static List<String> _parseSkills(dynamic raw) {
    if (raw is! List) return const [];
    return raw.map((e) => e.toString()).where((s) => s.isNotEmpty).toList();
  }


  factory AppUserModel.fromFirestore(String id, Map<String, dynamic> data) {
    final roleString = (data['role'] as String?) ?? 'student';

    final role =
        roleString == 'recruiter'
            ? UserRole.recruiter
            : UserRole.student;

    DateTime? lastSeen;
    final ls = data['lastSeen'];

    if (ls is Timestamp) {
      lastSeen = ls.toDate();
    } else if (ls is DateTime) {
      lastSeen = ls;
    }

    return AppUserModel(
      id: id,
      email: (data['email'] as String?) ?? '',
      fullName: (data['fullName'] as String?) ?? '',
      role: role,
      photoUrl: data['photoUrl'] as String?,
      bio: (data['bio'] as String?) ?? '',
      skills: _parseSkills(data['skills']),
      projects: _parseProjects(data['projects']),
      githubUrl: data['githubUrl'] as String?,
      linkedinUrl: data['linkedinUrl'] as String?,
      websiteUrl: data['websiteUrl'] as String?,
      cvUrl: data['cvUrl'] as String?,
      isOnline: data['isOnline'] as bool? ?? false,
      lastSeen: lastSeen,
    );
  }




  Map<String, dynamic> toFirestoreNewUser() {
    return {
      'email': email,
      'fullName': fullName,
      'role': role == UserRole.recruiter ? 'recruiter' : 'student',
      'photoUrl': photoUrl,
      'bio': bio,
      'skills': skills,
      'projects':
          projects
              .map(
                (p) => {
                  'title': p.title,
                  'description': p.description,
                  'link': p.link,
                },
              )
              .toList(),
      'githubUrl': githubUrl,
      'linkedinUrl': linkedinUrl,
      'websiteUrl': websiteUrl,
      'cvUrl': cvUrl,
      'searchNameLower': fullName.toLowerCase(),
      'isOnline': false,
      'createdAt': DateTime.now().toUtc(),
      'updatedAt': DateTime.now().toUtc(),
    };
  }


  Future<AppUserModel> updatePhoto(File imageFile) async {
    final cloudinary = CloudinaryService();
    final uploadedUrl = await cloudinary.uploadImage(imageFile);

    if (uploadedUrl != null) {
      return AppUserModel(
        id: id,
        email: email,
        fullName: fullName,
        role: role,
        photoUrl: uploadedUrl,
        bio: bio,
        skills: skills,
        projects: projects,
        githubUrl: githubUrl,
        linkedinUrl: linkedinUrl,
        websiteUrl: websiteUrl,
        cvUrl: cvUrl,
        isOnline: isOnline,
        lastSeen: lastSeen,
      );
    }

    return this;
  }
}