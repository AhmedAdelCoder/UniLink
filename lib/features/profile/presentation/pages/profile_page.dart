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
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/data/models/app_user_model.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/domain/entities/user_project.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../chat/data/chat_remote_datasource.dart';
import '../../../chat/presentation/pages/chat_detail_page.dart';
import '../../../connections/data/connections_remote_datasource.dart';
import '../../data/profile_remote_datasource.dart';

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
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 28),
                children: [
                  Center(
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 980),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildProfileHeader(context, user, uid, isMe),
                          const SizedBox(height: 16),
                          _sectionCard(
                            context: context,
                            title: 'About',
                            subtitle: 'Professional summary',
                            child: Text(
                              user.bio.trim().isEmpty
                                  ? 'No bio added yet. Use Edit Profile to introduce yourself.'
                                  : user.bio,
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            context: context,
                            title: 'Featured',
                            subtitle: 'Quick highlights',
                            child: Wrap(
                              spacing: 12,
                              runSpacing: 12,
                              children: [
                                _buildStatChip(
                                  context,
                                  icon: Icons.badge_outlined,
                                  label: user.role == UserRole.recruiter
                                      ? 'Recruiter'
                                      : 'Student',
                                ),
                                _buildStatChip(
                                  context,
                                  icon: Icons.psychology_alt_outlined,
                                  label: '${user.skills.length} skills',
                                ),
                                _buildStatChip(
                                  context,
                                  icon: Icons.folder_open_outlined,
                                  label: '${user.projects.length} projects',
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            context: context,
                            title: 'Connect',
                            subtitle: 'Public links and contact',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                _linkTile(
                                  context,
                                  icon: Icons.email_outlined,
                                  label: 'Email',
                                  value: user.email,
                                ),
                                const SizedBox(height: 10),
                                _linkTile(
                                  context,
                                  icon: Icons.code,
                                  label: 'GitHub',
                                  value: user.githubUrl,
                                ),
                                const SizedBox(height: 10),
                                _linkTile(
                                  context,
                                  icon: Icons.work_outline,
                                  label: 'LinkedIn',
                                  value: user.linkedinUrl,
                                ),
                                const SizedBox(height: 10),
                                _linkTile(
                                  context,
                                  icon: Icons.language_outlined,
                                  label: 'Website',
                                  value: user.websiteUrl,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            context: context,
                            title: 'CV & Documents',
                            subtitle: 'Resume and supporting links',
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if ((user.websiteUrl ?? '').trim().isNotEmpty)
                                  _documentRow(
                                    context,
                                    label: 'Portfolio',
                                    value: user.websiteUrl!,
                                  )
                                else
                                  Text(
                                    'No CV or document links added yet.',
                                    style:
                                        Theme.of(context).textTheme.bodyMedium,
                                  ),
                                const SizedBox(height: 8),
                                Text(
                                  'Tip: add resume or portfolio links in Edit Profile.',
                                  style: Theme.of(context).textTheme.bodySmall
                                      ?.copyWith(
                                        color: Theme.of(
                                          context,
                                        ).colorScheme.onSurfaceVariant,
                                      ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            context: context,
                            title: 'Projects',
                            subtitle: 'Showcase of your work',
                            child: user.projects.isEmpty
                                ? _emptyState(
                                    context,
                                    icon: Icons.folder_open_outlined,
                                    title: 'No projects yet',
                                    description:
                                        'Add your first project from Edit Profile.',
                                  )
                                : Column(
                                    children: user.projects
                                        .map(
                                          (p) => _projectCard(
                                            context,
                                            project: p,
                                          ),
                                        )
                                        .toList(),
                                  ),
                          ),
                          const SizedBox(height: 16),
                          _sectionCard(
                            context: context,
                            title: 'Skills',
                            subtitle: 'Core expertise',
                            child: user.skills.isEmpty
                                ? _emptyState(
                                    context,
                                    icon: Icons.auto_awesome_outlined,
                                    title: 'No skills yet',
                                    description:
                                        'Add your strengths in Edit Profile.',
                                  )
                                : Wrap(
                                    spacing: 10,
                                    runSpacing: 10,
                                    children: user.skills
                                        .map(
                                          (skill) => Chip(
                                            label: Text(skill),
                                            shape: RoundedRectangleBorder(
                                              borderRadius:
                                                  BorderRadius.circular(24),
                                            ),
                                            backgroundColor: Theme.of(context)
                                                .colorScheme
                                                .surfaceContainerHighest
                                                .withValues(alpha: 0.45),
                                          ),
                                        )
                                        .toList(),
                                  ),
                          ),
                          const SizedBox(height: 20),
                          if (isMe) _buildEditActions(context, user),
                          if (!isMe)
                            _buildConnectionAwareAction(context, user),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildProfileHeader(
    BuildContext context,
    AppUserModel user,
    String uid,
    bool isMe,
  ) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(
                alpha: 0.55,
              ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Row(
              children: [
                GestureDetector(
                  onTap: isMe ? () => _pickAndUploadPhoto(context, uid) : null,
                  child: CircleAvatar(
                    radius: 42,
                    backgroundImage: user.photoUrl != null
                        ? NetworkImage(user.photoUrl!)
                        : null,
                    child: user.photoUrl == null
                        ? Text(
                            user.fullName.isNotEmpty
                                ? user.fullName[0].toUpperCase()
                                : '?',
                            style: const TextStyle(fontSize: 28),
                          )
                        : null,
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user.fullName,
                        style: Theme.of(context).textTheme.headlineSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        user.email,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                      ),
                      const SizedBox(height: 8),
                      Chip(
                        label: Text(
                          user.role == UserRole.recruiter
                              ? 'Recruiter'
                              : 'Student',
                        ),
                        side: BorderSide(
                          color: Theme.of(context).colorScheme.primaryContainer,
                        ),
                        backgroundColor:
                            Theme.of(context).colorScheme.primaryContainer,
                        visualDensity: VisualDensity.compact,
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (isMe) ...[
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: OutlinedButton.icon(
                  onPressed: () => _pickAndUploadPhoto(context, uid),
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Change photo'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _buildEditActions(BuildContext context, AppUserModel user) {
    return Column(
      children: [
        FilledButton.icon(
          onPressed: () => _openEditSheet(context, user),
          icon: const Icon(Icons.edit_outlined),
          label: const Text('Edit Profile'),
        ),
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () {
            context.read<AuthBloc>().add(const AuthLogoutRequested());
          },
          icon: const Icon(Icons.logout),
          label: const Text('Log out'),
        ),
      ],
    );
  }

  Widget _buildConnectionAwareAction(BuildContext context, AppUserModel other) {
    final me = context.read<AuthBloc>().state.user;
    if (me == null) return const SizedBox.shrink();
    final connections = sl<ConnectionsRemoteDataSource>();
    return StreamBuilder<ConnectionStatus>(
      stream: connections.watchStatus(myUid: me.id, otherUid: other.id),
      builder: (context, snapshot) {
        final status = snapshot.data ?? ConnectionStatus.none;
        switch (status) {
          case ConnectionStatus.connected:
            return FilledButton.icon(
              onPressed: () => _openChat(context, other),
              icon: const Icon(Icons.message_outlined),
              label: const Text('Message'),
            );
          case ConnectionStatus.incomingPending:
            return FilledButton(
              onPressed: () async {
                await connections.acceptRequest(myUid: me.id, otherUid: other.id);
              },
              child: const Text('Accept Connection'),
            );
          case ConnectionStatus.outgoingPending:
            return const Chip(label: Text('Connection request pending'));
          case ConnectionStatus.none:
            return FilledButton.tonal(
              onPressed: () async {
                await connections.sendRequest(
                  myUid: me.id,
                  myName: me.fullName,
                  myPhotoUrl: me.photoUrl,
                  otherUid: other.id,
                  otherName: other.fullName,
                  otherPhotoUrl: other.photoUrl,
                );
              },
              child: const Text('Connect'),
            );
        }
      },
    );
  }

  Widget _sectionCard({
    required BuildContext context,
    required String title,
    required String subtitle,
    required Widget child,
  }) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(18),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(
                alpha: 0.55,
              ),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      ),
    );
  }

  Widget _buildStatChip(
    BuildContext context, {
    required IconData icon,
    required String label,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 8),
          Text(label),
        ],
      ),
    );
  }

  Widget _linkTile(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String? value,
  }) {
    final clean = value?.trim() ?? '';
    final hasValue = clean.isNotEmpty;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(
              alpha: 0.28,
            ),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                Text(
                  hasValue ? clean : 'Not provided',
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: hasValue
                            ? Theme.of(context).colorScheme.onSurface
                            : Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                ),
              ],
            ),
          ),
          if (hasValue)
            IconButton(
              tooltip: 'Copy',
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: clean));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('$label copied')),
                  );
                }
              },
              icon: const Icon(Icons.copy, size: 18),
            ),
        ],
      ),
    );
  }

  Widget _documentRow(
    BuildContext context, {
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        const Icon(Icons.description_outlined, size: 18),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            '$label: $value',
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ),
      ],
    );
  }

  Widget _projectCard(BuildContext context, {required UserProject project}) {
    final hasLink = (project.link ?? '').trim().isNotEmpty;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: Theme.of(context).colorScheme.outlineVariant.withValues(
                alpha: 0.5,
              ),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            project.title,
            style: Theme.of(
              context,
            ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            project.description.trim().isEmpty
                ? 'No description provided.'
                : project.description,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
          if (hasLink) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: () async {
                  await Clipboard.setData(
                    ClipboardData(text: project.link!.trim()),
                  );
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Project link copied')),
                    );
                  }
                },
                icon: const Icon(Icons.link, size: 18),
                label: const Text('Copy link'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _emptyState(
    BuildContext context, {
    required IconData icon,
    required String title,
    required String description,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        color: Theme.of(context).colorScheme.surfaceContainerHighest.withValues(
              alpha: 0.25,
            ),
      ),
      child: Row(
        children: [
          Icon(icon),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: Theme.of(
                    context,
                  ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 2),
                Text(description, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
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

  try {
    // منع فتح شات مع نفسك
    if (auth.id == other.id) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("You can't message yourself")),
      );
      return;
    }

    await chat.ensureThread(
      myUid: auth.id,
      otherUid: other.id,
      myName: auth.fullName,
      otherName: other.fullName,
    );

    final threadId = chat.threadIdFor(auth.id, other.id);

    if (!context.mounted) return;

    Navigator.of(context).pushNamed(
      ChatDetailPage.routeName,
      arguments: ChatDetailArgs(
        threadId: threadId,
        otherUserId: other.id,
        otherUserName: other.fullName,
      ),
    );
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("Failed to open chat: $e")),
      );
    }
  }
}

  // ================= EDIT =================
  Future<void> _openEditSheet(BuildContext context, AppUser user) async {
    final nameCtrl = TextEditingController(text: user.fullName);
    final bioCtrl = TextEditingController(text: user.bio);
    final ghCtrl = TextEditingController(text: user.githubUrl ?? '');
    final liCtrl = TextEditingController(text: user.linkedinUrl ?? '');
    final webCtrl = TextEditingController(text: user.websiteUrl ?? '');
    final skillInputCtrl = TextEditingController();
    final pTitleCtrl = TextEditingController();
    final pDescCtrl = TextEditingController();
    final pLinkCtrl = TextEditingController();
    final tempSkills = List<String>.from(user.skills);
    final tempProjects = List<UserProject>.from(user.projects);
    if (!context.mounted) return;
    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 8,
                bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
              ),
              child: SafeArea(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(
                        'Edit Profile',
                        style: Theme.of(
                          ctx,
                        ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 14),
                      TextField(
                        controller: nameCtrl,
                        decoration: _inputDecoration('Full name'),
                      ),
                      const SizedBox(height: 12),
                      TextField(
                        controller: bioCtrl,
                        maxLines: 4,
                        decoration: _inputDecoration('Bio'),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Connect',
                        style: Theme.of(ctx).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: ghCtrl,
                        decoration: _inputDecoration('GitHub URL'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: liCtrl,
                        decoration: _inputDecoration('LinkedIn URL'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: webCtrl,
                        decoration: _inputDecoration('Website / CV URL'),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Add Skill',
                        style: Theme.of(ctx).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Expanded(
                            child: TextField(
                              controller: skillInputCtrl,
                              decoration: _inputDecoration(
                                'e.g., Flutter, Firebase',
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          FilledButton.icon(
                            onPressed: () {
                              final value = skillInputCtrl.text.trim();
                              if (value.isEmpty || tempSkills.contains(value)) {
                                return;
                              }
                              setModalState(() {
                                tempSkills.add(value);
                                skillInputCtrl.clear();
                              });
                            },
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Add'),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (tempSkills.isEmpty)
                        Text(
                          'No skills added yet.',
                          style: Theme.of(ctx).textTheme.bodySmall,
                        )
                      else
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: tempSkills
                              .map(
                                (skill) => Chip(
                                  label: Text(skill),
                                  onDeleted: () {
                                    setModalState(() {
                                      tempSkills.remove(skill);
                                    });
                                  },
                                ),
                              )
                              .toList(),
                        ),
                      const SizedBox(height: 16),
                      Text(
                        'Add Project',
                        style: Theme.of(ctx).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      TextField(
                        controller: pTitleCtrl,
                        decoration: _inputDecoration('Project title'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: pDescCtrl,
                        maxLines: 3,
                        decoration: _inputDecoration('Project description'),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: pLinkCtrl,
                        decoration: _inputDecoration('Project link (optional)'),
                      ),
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: FilledButton.tonalIcon(
                          onPressed: () {
                            final title = pTitleCtrl.text.trim();
                            if (title.isEmpty) return;
                            setModalState(() {
                              tempProjects.add(
                                UserProject(
                                  title: title,
                                  description: pDescCtrl.text.trim(),
                                  link: pLinkCtrl.text.trim().isEmpty
                                      ? null
                                      : pLinkCtrl.text.trim(),
                                ),
                              );
                              pTitleCtrl.clear();
                              pDescCtrl.clear();
                              pLinkCtrl.clear();
                            });
                          },
                          icon: const Icon(Icons.add),
                          label: const Text('Add Project'),
                        ),
                      ),
                      const SizedBox(height: 10),
                      if (tempProjects.isEmpty)
                        Text(
                          'No projects added yet.',
                          style: Theme.of(ctx).textTheme.bodySmall,
                        )
                      else
                        Column(
                          children: tempProjects
                              .asMap()
                              .entries
                              .map(
                                (entry) => Container(
                                  margin: const EdgeInsets.only(bottom: 8),
                                  padding: const EdgeInsets.all(10),
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(
                                      color: Theme.of(ctx)
                                          .colorScheme
                                          .outlineVariant,
                                    ),
                                  ),
                                  child: Row(
                                    children: [
                                      Expanded(
                                        child: Text(
                                          entry.value.title,
                                          style: Theme.of(ctx)
                                              .textTheme
                                              .bodyMedium
                                              ?.copyWith(
                                                fontWeight: FontWeight.w600,
                                              ),
                                        ),
                                      ),
                                      IconButton(
                                        onPressed: () {
                                          setModalState(() {
                                            tempProjects.removeAt(entry.key);
                                          });
                                        },
                                        icon: const Icon(
                                          Icons.delete_outline,
                                          size: 18,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      const SizedBox(height: 18),
                      Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              onPressed: () => Navigator.pop(ctx),
                              child: const Text('Cancel'),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: FilledButton(
                              onPressed: () async {
                                final uid = context.read<AuthBloc>().state.user?.id;
                                if (uid == null) return;
                                try {
                                  await sl<ProfileRemoteDataSource>().updateProfile(
                                    uid: uid,
                                    fullName: nameCtrl.text.trim(),
                                    bio: bioCtrl.text.trim(),
                                    skills: tempSkills,
                                    projects: tempProjects,
                                    githubUrl: ghCtrl.text.trim().isEmpty
                                        ? null
                                        : ghCtrl.text.trim(),
                                    linkedinUrl: liCtrl.text.trim().isEmpty
                                        ? null
                                        : liCtrl.text.trim(),
                                    websiteUrl: webCtrl.text.trim().isEmpty
                                        ? null
                                        : webCtrl.text.trim(),
                                  );
                                  if (ctx.mounted) Navigator.pop(ctx);
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(
                                        content: Text('Profile saved'),
                                      ),
                                    );
                                  }
                                } catch (e) {
                                  if (context.mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(content: Text('Error: $e')),
                                    );
                                  }
                                }
                              },
                              child: const Text('Save Changes'),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        );
      },
    );
  }

  InputDecoration _inputDecoration(String label) {
    return InputDecoration(
      labelText: label,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    );
  }
}