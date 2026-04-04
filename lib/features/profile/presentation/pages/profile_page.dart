// import 'dart:io';

// import 'package:flutter/material.dart';
// import 'package:flutter_bloc/flutter_bloc.dart';
// import 'package:image_picker/image_picker.dart';

// import '../../../../core/config/injection_container.dart';
// import '../../../auth/data/models/app_user_model.dart';
// import '../../../auth/domain/entities/app_user.dart';
// import '../../../auth/domain/entities/user_project.dart';
// import '../../../auth/presentation/bloc/auth_bloc.dart';
// import '../../data/profile_remote_datasource.dart';
// import '../../../chat/data/chat_remote_datasource.dart';
// import '../../../chat/presentation/pages/chat_detail_page.dart';

// class ProfilePage extends StatelessWidget {
//   final String? userId; // null = my profile

//   const ProfilePage({super.key, this.userId});

//   @override
//   Widget build(BuildContext context) {
//     return BlocBuilder<AuthBloc, AuthState>(
//       builder: (context, authState) {
//         final myUid = authState.user?.id;
//         final uid = userId ?? myUid;
//         print("Opening profile UID: $uid");
//         final isMe = uid == myUid;

//         if (uid == null) {
//           return const Center(child: Text('Sign in to view profile'));
//         }

//         final ds = sl<ProfileRemoteDataSource>();

//         return StreamBuilder<AppUserModel?>(
//           stream: ds.watchProfile(uid),
//           builder: (context, snapshot) {
//             if (snapshot.connectionState == ConnectionState.waiting &&
//                 !snapshot.hasData) {
//               return const Center(child: CircularProgressIndicator());
//             }
//             final user = snapshot.data;
//             if (user == null) {
//               return const Center(child: Text('Profile not found'));
//             }

//             return ListView
//             (
//               padding: const EdgeInsets.all(16),
//               children: [
//                 Row(
//                   children: [
//                     GestureDetector(
//                       onTap: isMe? () => _pickAndUploadPhoto(context, uid): null,
//                       child: CircleAvatar(
//                         radius: 48,
//                         backgroundImage: user.photoUrl != null
//                             ? NetworkImage(user.photoUrl!)
//                             : null,
//                         child: user.photoUrl == null
//                             ? Text(
//                                 user.fullName.isNotEmpty
//                                     ? user.fullName[0].toUpperCase()
//                                     : '?',
//                                 style: const TextStyle(fontSize: 32),
//                               )
//                             : null,
//                       ),
//                     ),
//                     const SizedBox(width: 16),
//                     Expanded(
//                       child: Column(
//                         crossAxisAlignment: CrossAxisAlignment.start,
//                         children: [
//                           Text(
//                             user.fullName,
//                             style: Theme.of(context).textTheme.titleLarge,
//                           ),
//                           Text(
//                             user.email,
//                             style: Theme.of(context).textTheme.bodySmall,
//                           ),
//                           Text(
//                             user.role == UserRole.recruiter
//                                 ? 'Recruiter'
//                                 : 'Student',
//                             style: TextStyle(
//                               color: Theme.of(context).colorScheme.primary,
//                               fontWeight: FontWeight.w600,
//                             ),
//                           ),
//                         ],
//                       ),
//                     ),
//                   ],
//                 ),
//                 const SizedBox(height: 8),
//                 if(isMe)
//                 TextButton.icon(
//                   onPressed: () => _pickAndUploadPhoto(context, uid),
//                   icon: const Icon(Icons.camera_alt_outlined),
//                   label: const Text('Change photo'),
//                 ),
//                 const Divider(),
//                 ListTile(
//                   title: const Text('Bio'),
//                   subtitle: Text(
//                     user.bio.isEmpty ? 'Tap edit to add a bio' : user.bio,
//                   ),
//                 ),
//                 if (user.skills.isNotEmpty) ...[
//                   const Text(
//                     'Skills',
//                     style: TextStyle(fontWeight: FontWeight.bold),
//                   ),
//                   const SizedBox(height: 8),
//                   Wrap(
//                     spacing: 8,
//                     runSpacing: 4,
//                     children: user.skills
//                         .map((s) => Chip(label: Text(s)))
//                         .toList(),
//                   ),
//                   const SizedBox(height: 16),
//                 ],
//                 if (user.projects.isNotEmpty) ...[
//                   const Text(
//                     'Projects',
//                     style: TextStyle(fontWeight: FontWeight.bold),
//                   ),
//                   ...user.projects.map(
//                     (p) => ListTile(
//                       title: Text(p.title),
//                       subtitle: Text(p.description),
//                       trailing: p.link != null && p.link!.isNotEmpty
//                           ? IconButton(
//                               icon: const Icon(Icons.link),
//                               onPressed: () {},
//                             )
//                           : null,
//                     ),
//                   ),
//                 ],
//                 const SizedBox(height: 16),
//                 if(isMe)
//                 FilledButton.icon(
//                   onPressed: () => _openEditSheet(context, user),
//                   icon: const Icon(Icons.edit),
//                   label: const Text('Edit profile'),
//                 ),
//                 const SizedBox(height: 16),
//                 if(isMe)
//                 OutlinedButton.icon(
//                   onPressed: () {
//                     context.read<AuthBloc>().add(const AuthLogoutRequested());
//                   },
//                   icon: const Icon(Icons.logout),
//                   label: const Text('Log out'),
//                 ),
//                 const SizedBox(height: 16),

//                 if (!isMe)
//                   FilledButton(
//                     onPressed: () => _openChat(context, user),
//                     child: const Text("Message"),
//                   ),
//               ],
//             );
//           },
//         );
//       },
//     );
//   }

//   // ==========================
//   // دالة اختيار ورفع صورة على Cloudinary
//   // ==========================
//   Future<void> _pickAndUploadPhoto(BuildContext context, String uid) async {
//     final picker = ImagePicker();
//     final x = await picker.pickImage(
//       source: ImageSource.gallery,
//       maxWidth: 1024,
//       imageQuality: 85,
//     );
//     if (x == null || !context.mounted) return;
//     try {
//       await sl<ProfileRemoteDataSource>().uploadProfilePhoto(uid, File(x.path));
//       if (context.mounted) {
//         ScaffoldMessenger.of(
//           context,
//         ).showSnackBar(const SnackBar(content: Text('Profile photo updated')));
//       }
//     } catch (e) {
//       if (context.mounted) {
//         ScaffoldMessenger.of(
//           context,
//         ).showSnackBar(SnackBar(content: Text('Upload failed: $e')));
//       }
//     }
//   }

//   // ==========================
//   // دالة فتح Bottom Sheet لتعديل بيانات الملف الشخصي
//   // ==========================
//   Future<void> _openEditSheet(BuildContext context, AppUser user) async 
//   {
//     final nameCtrl = TextEditingController(text: user.fullName);
//     final bioCtrl = TextEditingController(text: user.bio);
//     final skillsCtrl = TextEditingController(text: user.skills.join(', '));
//     final ghCtrl = TextEditingController(text: user.githubUrl ?? '');
//     final liCtrl = TextEditingController(text: user.linkedinUrl ?? '');
//     final webCtrl = TextEditingController(text: user.websiteUrl ?? '');
//     final pTitleCtrl = TextEditingController();
//     final pDescCtrl = TextEditingController();
//     final pLinkCtrl = TextEditingController();

//     if (!context.mounted) return;
//     await showModalBottomSheet<void>(
//       context: context,
//       isScrollControlled: true,
//       builder: (ctx) {
//         return Padding(
//           padding: EdgeInsets.only(
//             left: 16,
//             right: 16,
//             top: 16,
//             bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
//           ),
//           child: SingleChildScrollView(
//             child: Column(
//               crossAxisAlignment: CrossAxisAlignment.stretch,
//               mainAxisSize: MainAxisSize.min,
//               children: [
//                 Text('Edit profile', style: Theme.of(ctx).textTheme.titleLarge),
//                 const SizedBox(height: 12),
//                 TextField(
//                   controller: nameCtrl,
//                   decoration: const InputDecoration(labelText: 'Full name'),
//                 ),
//                 TextField(
//                   controller: bioCtrl,
//                   maxLines: 3,
//                   decoration: const InputDecoration(labelText: 'Bio'),
//                 ),
//                 TextField(
//                   controller: skillsCtrl,
//                   decoration: const InputDecoration(
//                     labelText: 'Skills (comma separated)',
//                   ),
//                 ),
//                 TextField(
//                   controller: ghCtrl,
//                   decoration: const InputDecoration(labelText: 'GitHub URL'),
//                 ),
//                 TextField(
//                   controller: liCtrl,
//                   decoration: const InputDecoration(labelText: 'LinkedIn URL'),
//                 ),
//                 TextField(
//                   controller: webCtrl,
//                   decoration: const InputDecoration(labelText: 'Website'),
//                 ),
//                 const SizedBox(height: 8),
//                 const Text('Add a project (optional)'),
//                 TextField(
//                   controller: pTitleCtrl,
//                   decoration: const InputDecoration(labelText: 'Title'),
//                 ),
//                 TextField(
//                   controller: pDescCtrl,
//                   decoration: const InputDecoration(labelText: 'Description'),
//                 ),
//                 TextField(
//                   controller: pLinkCtrl,
//                   decoration: const InputDecoration(labelText: 'Link'),
//                 ),
//                 const SizedBox(height: 16),
//                 FilledButton(
//                   onPressed: () async {
//                     final uid = context.read<AuthBloc>().state.user?.id;
//                     if (uid == null) return;
//                     final skills = skillsCtrl.text
//                         .split(',')
//                         .map((s) => s.trim())
//                         .where((s) => s.isNotEmpty)
//                         .toList();
//                     final projects = List<UserProject>.from(user.projects);
//                     if (pTitleCtrl.text.trim().isNotEmpty) {
//                       projects.add(
//                         UserProject(
//                           title: pTitleCtrl.text.trim(),
//                           description: pDescCtrl.text.trim(),
//                           link: pLinkCtrl.text.trim().isEmpty
//                               ? null
//                               : pLinkCtrl.text.trim(),
//                         ),
//                       );
//                     }
//                     try {
//                       await sl<ProfileRemoteDataSource>().updateProfile(
//                         uid: uid,
//                         fullName: nameCtrl.text.trim(),
//                         bio: bioCtrl.text.trim(),
//                         skills: skills,
//                         projects: projects,
//                         githubUrl: ghCtrl.text.trim().isEmpty
//                             ? null
//                             : ghCtrl.text.trim(),
//                         linkedinUrl: liCtrl.text.trim().isEmpty
//                             ? null
//                             : liCtrl.text.trim(),
//                         websiteUrl: webCtrl.text.trim().isEmpty
//                             ? null
//                             : webCtrl.text.trim(),
//                       );
//                       if (ctx.mounted) Navigator.pop(ctx);
//                       if (context.mounted) {
//                         ScaffoldMessenger.of(context).showSnackBar(
//                           const SnackBar(content: Text('Profile saved')),
//                         );
//                       }
//                     } catch (e) {
//                       if (context.mounted) {
//                         ScaffoldMessenger.of(
//                           context,
//                         ).showSnackBar(SnackBar(content: Text('Error: $e')));
//                       }
//                     }
//                   },
//                   child: const Text('Save'),
//                 ),
//               ],
//             ),
//           ),
//         );
//       },
//     );
//   }
//   Future<void> _openChat(BuildContext context, AppUserModel other) async {
//   final auth = context.read<AuthBloc>().state.user;

//   if (auth == null) return;

//   final chat = sl<ChatRemoteDataSource>();

//   await chat.ensureThread(
//     myUid: auth.id,
//     otherUid: other.id,
//     myName: auth.fullName,
//     otherName: other.fullName,
//   );

//   final threadId = chat.threadIdFor(auth.id, other.id);

//   if (!context.mounted) return;

//   await Navigator.of(context).pushNamed(
//     ChatDetailPage.routeName,
//     arguments: ChatDetailArgs(
//       threadId: threadId,
//       otherUserId: other.id,
//       otherUserName: other.fullName,
//     ),
//   );
// }

// }



import 'dart:io';
import 'dart:developer';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/data/models/app_user_model.dart';
import '../../../auth/domain/entities/app_user.dart';

import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../data/profile_remote_datasource.dart';
import '../../../chat/data/chat_remote_datasource.dart';
import '../../../chat/presentation/pages/chat_detail_page.dart';

class ProfilePage extends StatelessWidget {
  final String? userId; // null = my profile

  const ProfilePage({super.key, this.userId});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, authState) {
        final myUid = authState.user?.id;
        final uid = userId ?? myUid;

        log("Opening profile UID: $uid");

        if (uid == null) {
          return const Scaffold(
            body: Center(child: Text('Sign in to view profile')),
          );
        }

        final isMe = uid == myUid;
        final ds = sl<ProfileRemoteDataSource>();

        return StreamBuilder<AppUserModel?>(
          stream: ds.watchProfile(uid),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }

            final user = snapshot.data;

            if (user == null) {
              return const Scaffold(
                body: Center(child: Text('Profile not found')),
              );
            }

            return Scaffold(
              appBar: AppBar(
                title: Text(isMe ? "My Profile" : "User Profile"),
              ),
              body: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // ================= HEADER =================
                  Row(
                    children: [
                      GestureDetector(
                        onTap:
                            isMe ? () => _pickAndUploadPhoto(context, uid) : null,
                        child: CircleAvatar(
                          radius: 48,
                          backgroundImage: user.photoUrl != null
                              ? NetworkImage(user.photoUrl!)
                              : null,
                          child: user.photoUrl == null
                              ? Text(
                                  user.fullName.isNotEmpty
                                      ? user.fullName[0].toUpperCase()
                                      : '?',
                                  style: const TextStyle(fontSize: 32),
                                )
                              : null,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              user.fullName,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                            Text(
                              user.email,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                            Text(
                              user.role == UserRole.recruiter
                                  ? 'Recruiter'
                                  : 'Student',
                              style: TextStyle(
                                color: Theme.of(context).colorScheme.primary,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 8),

                  // ================= CHANGE PHOTO =================
                  if (isMe)
                    TextButton.icon(
                      onPressed: () => _pickAndUploadPhoto(context, uid),
                      icon: const Icon(Icons.camera_alt_outlined),
                      label: const Text('Change photo'),
                    ),

                  const Divider(),

                  // ================= BIO =================
                  ListTile(
                    title: const Text('Bio'),
                    subtitle: Text(
                      user.bio.isEmpty ? 'No bio available' : user.bio,
                    ),
                  ),

                  // ================= SKILLS =================
                  if (user.skills.isNotEmpty) ...[
                    const Text(
                      'Skills',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children:
                          user.skills.map((s) => Chip(label: Text(s))).toList(),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // ================= PROJECTS =================
                  if (user.projects.isNotEmpty) ...[
                    const Text(
                      'Projects',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    ...user.projects.map(
                      (p) => ListTile(
                        title: Text(p.title),
                        subtitle: Text(p.description),
                        trailing: p.link != null && p.link!.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.link),
                                onPressed: () {},
                              )
                            : null,
                      ),
                    ),
                  ],

                  const SizedBox(height: 16),

                  // ================= EDIT =================
                  if (isMe)
                    FilledButton.icon(
                      onPressed: () => _openEditSheet(context, user),
                      icon: const Icon(Icons.edit),
                      label: const Text('Edit profile'),
                    ),

                  const SizedBox(height: 16),

                  // ================= LOGOUT =================
                  if (isMe)
                    OutlinedButton.icon(
                      onPressed: () {
                        context
                            .read<AuthBloc>()
                            .add(const AuthLogoutRequested());
                      },
                      icon: const Icon(Icons.logout),
                      label: const Text('Log out'),
                    ),

                  const SizedBox(height: 16),

                  // ================= MESSAGE =================
                  if (!isMe)
                    FilledButton(
                      onPressed: () => _openChat(context, user),
                      child: const Text("Message"),
                    ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  // ================= PHOTO =================
  Future<void> _pickAndUploadPhoto(BuildContext context, String uid) async {
    final picker = ImagePicker();
    final x = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );

    if (x == null || !context.mounted) return;

    try {
      await sl<ProfileRemoteDataSource>()
          .uploadProfilePhoto(uid, File(x.path));

      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile photo updated')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $e')),
        );
      }
    }
  }

  // ================= CHAT =================
  Future<void> _openChat(BuildContext context, AppUserModel other) async {
    final auth = context.read<AuthBloc>().state.user;
    if (auth == null) return;

    final chat = sl<ChatRemoteDataSource>();

    await chat.ensureThread(
      myUid: auth.id,
      otherUid: other.id,
      myName: auth.fullName,
      otherName: other.fullName,
    );

    final threadId = chat.threadIdFor(auth.id, other.id);

    if (!context.mounted) return;

    await Navigator.of(context).pushNamed(
      ChatDetailPage.routeName,
      arguments: ChatDetailArgs(
        threadId: threadId,
        otherUserId: other.id,
        otherUserName: other.fullName,
      ),
    );
  }

  // ================= EDIT =================
  Future<void> _openEditSheet(BuildContext context, AppUser user) async {
    final nameCtrl = TextEditingController(text: user.fullName);
    final bioCtrl = TextEditingController(text: user.bio);
    final skillsCtrl = TextEditingController(text: user.skills.join(', '));
    if (!context.mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(controller: nameCtrl),
              TextField(controller: bioCtrl),
              TextField(controller: skillsCtrl),
              FilledButton(
                onPressed: () async {
                  final uid =
                      context.read<AuthBloc>().state.user?.id;
                  if (uid == null) return;

                  final skills = skillsCtrl.text
                      .split(',')
                      .map((e) => e.trim())
                      .toList();

                  await sl<ProfileRemoteDataSource>().updateProfile(
                    uid: uid,
                    fullName: nameCtrl.text,
                    bio: bioCtrl.text,
                    skills: skills,
                    projects: user.projects,
                  );

                  if (ctx.mounted) Navigator.pop(ctx);
                },
                child: const Text("Save"),
              )
            ],
          ),
        );
      },
    );
  }
}