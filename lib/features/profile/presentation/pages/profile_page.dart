import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/data/models/app_user_model.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/domain/entities/user_project.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../data/profile_remote_datasource.dart';

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, authState) {
        final uid = authState.user?.id;
        if (uid == null) {
          return const Center(child: Text('Sign in to view your profile'));
        }

        final ds = sl<ProfileRemoteDataSource>();

        return StreamBuilder<AppUserModel?>(
          stream: ds.watchProfile(uid),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }
            final user = snapshot.data;
            if (user == null) {
              return const Center(child: Text('Profile not found'));
            }

            return CustomScrollView(
              slivers: [
                // Header section with profile photo and basic info
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      children: [
                        _buildProfileHeader(context, user, uid),
                        const SizedBox(height: 24),
                      ],
                    ),
                  ),
                ),
                // Bio section
                if (user.bio.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildBioSection(context, user),
                    ),
                  ),
                // Skills section
                if (user.skills.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildSkillsSection(context, user),
                    ),
                  ),
                // Social links section
                if (user.githubUrl != null ||
                    user.linkedinUrl != null ||
                    user.websiteUrl != null)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildSocialLinksSection(context, user),
                    ),
                  ),
                // Projects section
                if (user.projects.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: _buildProjectsSection(context, user),
                    ),
                  ),
                // Action buttons
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        FilledButton.icon(
                          onPressed: () => _openEditSheet(context, user),
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Edit profile'),
                        ),
                        const SizedBox(height: 12),
                        OutlinedButton.icon(
                          onPressed: () {
                            context.read<AuthBloc>().add(const AuthLogoutRequested());
                          },
                          icon: const Icon(Icons.logout_outlined),
                          label: const Text('Log out'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 16)),
              ],
            );
          },
        );
      },
    );
  }

  Widget _buildProfileHeader(BuildContext context, AppUserModel user, String uid) {
    return Column(
      children: [
        // Profile photo with upload overlay
        Stack(
          alignment: Alignment.bottomRight,
          children: [
            Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                  color: Theme.of(context).colorScheme.primary,
                  width: 3,
                ),
              ),
              child: CircleAvatar(
                radius: 64,
                backgroundImage: user.photoUrl != null
                    ? NetworkImage(user.photoUrl!)
                    : null,
                backgroundColor: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                child: user.photoUrl == null
                    ? Text(
                      user.fullName.isNotEmpty
                          ? user.fullName[0].toUpperCase()
                          : '?',
                      style: TextStyle(
                        fontSize: 48,
                        fontWeight: FontWeight.bold,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    )
                    : null,
              ),
            ),
            GestureDetector(
              onTap: () => _pickAndUploadPhoto(context, uid),
              child: Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Theme.of(context).colorScheme.primary,
                  border: Border.all(
                    color: Theme.of(context).scaffoldBackgroundColor,
                    width: 3,
                  ),
                ),
                padding: const EdgeInsets.all(8),
                child: const Icon(
                  Icons.camera_alt,
                  color: Colors.white,
                  size: 20,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        // Name and role
        Text(
          user.fullName,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.bold,
          ),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 4),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.primary.withOpacity(0.15),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Text(
            user.role == UserRole.recruiter ? 'Recruiter' : 'Student',
            style: TextStyle(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w600,
              fontSize: 12,
            ),
          ),
        ),
        const SizedBox(height: 12),
        // Email
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.email_outlined,
              size: 16,
              color: Theme.of(context).colorScheme.secondary,
            ),
            const SizedBox(width: 6),
            Text(
              user.email,
              style: Theme.of(context).textTheme.bodyMedium,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildBioSection(BuildContext context, AppUserModel user) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'About',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              user.bio,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.justify,
            ),
          ),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSkillsSection(BuildContext context, AppUserModel user) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Skills',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: user.skills.map((skill) {
            return Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primary.withOpacity(0.15),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Theme.of(context).colorScheme.primary.withOpacity(0.3),
                  width: 1.5,
                ),
              ),
              child: Text(
                skill,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w500,
                  fontSize: 13,
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildSocialLinksSection(BuildContext context, AppUserModel user) {
    final links = <({String label, String? url, IconData icon})>[
      (
        label: 'GitHub',
        url: user.githubUrl,
        icon: Icons.language,
      ),
      (
        label: 'LinkedIn',
        url: user.linkedinUrl,
        icon: Icons.language,
      ),
      (
        label: 'Website',
        url: user.websiteUrl,
        icon: Icons.language,
      ),
    ].whereType<({String label, String? url, IconData icon})>().where((l) => l.url != null && l.url!.isNotEmpty).toList();

    if (links.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Links',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.start,
          children: links.asMap().entries.map((entry) {
            final link = entry.value;
            return Padding(
              padding: EdgeInsets.only(right: entry.key < links.length - 1 ? 12 : 0),
              child: Tooltip(
                message: link.label,
                child: Material(
                  color: Colors.transparent,
                  child: InkWell(
                    onTap: () {
                      // TODO: Launch URL
                    },
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.primary.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.open_in_new,
                        color: Theme.of(context).colorScheme.primary,
                        size: 20,
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 24),
      ],
    );
  }

  Widget _buildProjectsSection(BuildContext context, AppUserModel user) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Projects',
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 12),
        ...user.projects.asMap().entries.map((entry) {
          final project = entry.value;
          final isLast = entry.key == user.projects.length - 1;
          return Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 12),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            project.title,
                            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (project.link != null && project.link!.isNotEmpty)
                          Material(
                            color: Colors.transparent,
                            child: IconButton(
                              icon: Icon(
                                Icons.open_in_new,
                                color: Theme.of(context).colorScheme.primary,
                                size: 20,
                              ),
                              onPressed: () {
                                // TODO: Launch URL
                              },
                              iconSize: 24,
                              padding: EdgeInsets.zero,
                              constraints: const BoxConstraints(),
                            ),
                          ),
                      ],
                    ),
                    if (project.description.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Text(
                        project.description,
                        style: Theme.of(context).textTheme.bodySmall,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          );
        }).toList(),
        const SizedBox(height: 24),
      ],
    );
  }

  // ==========================
  // دالة اختيار ورفع صورة على Cloudinary
  // ==========================
  Future<void> _pickAndUploadPhoto(BuildContext context, String uid) async {
    final picker = ImagePicker();
    final x = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (x == null || !context.mounted) return;
    try {
      await sl<ProfileRemoteDataSource>().uploadProfilePhoto(uid, File(x.path));
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

  // ==========================
  // دالة فتح Bottom Sheet لتعديل بيانات الملف الشخصي
  // ==========================
  Future<void> _openEditSheet(BuildContext context, AppUser user) async {
    final nameCtrl = TextEditingController(text: user.fullName);
    final bioCtrl = TextEditingController(text: user.bio);
    final skillsCtrl = TextEditingController(text: user.skills.join(', '));
    final ghCtrl = TextEditingController(text: user.githubUrl ?? '');
    final liCtrl = TextEditingController(text: user.linkedinUrl ?? '');
    final webCtrl = TextEditingController(text: user.websiteUrl ?? '');
    final pTitleCtrl = TextEditingController();
    final pDescCtrl = TextEditingController();
    final pLinkCtrl = TextEditingController();

    if (!context.mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (ctx) {
        return DraggableScrollableSheet(
          expand: false,
          initialChildSize: 0.9,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          builder: (context, scrollController) {
            return SingleChildScrollView(
              controller: scrollController,
              child: Padding(
                padding: EdgeInsets.only(
                  left: 16,
                  right: 16,
                  bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
                  top: 12,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Header
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Edit Profile',
                          style: Theme.of(ctx).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Update your professional information',
                          style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                            color: Theme.of(ctx).textTheme.bodySmall?.color?.withOpacity(0.7),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Basic Information Section
                    _buildEditSection(
                      context: ctx,
                      title: 'Basic Information',
                      icon: Icons.person_outline,
                      children: [
                        _buildEditTextField(
                          ctx,
                          controller: nameCtrl,
                          label: 'Full Name',
                          hint: 'Enter your full name',
                          icon: Icons.person,
                        ),
                        const SizedBox(height: 16),
                        _buildEditTextField(
                          ctx,
                          controller: bioCtrl,
                          label: 'Bio',
                          hint: 'Tell us about yourself',
                          icon: Icons.description_outlined,
                          maxLines: 4,
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Skills Section
                    _buildEditSection(
                      context: ctx,
                      title: 'Skills',
                      icon: Icons.star_outline,
                      children: [
                        _buildEditTextField(
                          ctx,
                          controller: skillsCtrl,
                          label: 'Skills',
                          hint: 'Enter skills separated by commas',
                          icon: Icons.local_offer_outlined,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Example: Flutter, Dart, Firebase',
                          style: Theme.of(ctx).textTheme.bodySmall?.copyWith(
                            color: Theme.of(ctx).textTheme.bodySmall?.color?.withOpacity(0.6),
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Social Links Section
                    _buildEditSection(
                      context: ctx,
                      title: 'Social Links',
                      icon: Icons.link,
                      children: [
                        _buildEditTextField(
                          ctx,
                          controller: ghCtrl,
                          label: 'GitHub URL',
                          hint: 'https://github.com/username',
                          icon: Icons.language,
                        ),
                        const SizedBox(height: 16),
                        _buildEditTextField(
                          ctx,
                          controller: liCtrl,
                          label: 'LinkedIn URL',
                          hint: 'https://linkedin.com/in/username',
                          icon: Icons.language,
                        ),
                        const SizedBox(height: 16),
                        _buildEditTextField(
                          ctx,
                          controller: webCtrl,
                          label: 'Website',
                          hint: 'https://yourwebsite.com',
                          icon: Icons.language,
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Add Project Section
                    _buildEditSection(
                      context: ctx,
                      title: 'Add Project (Optional)',
                      icon: Icons.folder_outlined,
                      children: [
                        _buildEditTextField(
                          ctx,
                          controller: pTitleCtrl,
                          label: 'Project Title',
                          hint: 'Enter project name',
                          icon: Icons.title,
                        ),
                        const SizedBox(height: 16),
                        _buildEditTextField(
                          ctx,
                          controller: pDescCtrl,
                          label: 'Description',
                          hint: 'Describe your project',
                          icon: Icons.description_outlined,
                          maxLines: 3,
                        ),
                        const SizedBox(height: 16),
                        _buildEditTextField(
                          ctx,
                          controller: pLinkCtrl,
                          label: 'Project Link',
                          hint: 'https://project-link.com',
                          icon: Icons.link,
                        ),
                      ],
                    ),
                    const SizedBox(height: 32),

                    // Action Buttons
                    FilledButton(
                      onPressed: () async {
                        final uid = context.read<AuthBloc>().state.user?.id;
                        if (uid == null) return;
                        final skills = skillsCtrl.text
                            .split(',')
                            .map((s) => s.trim())
                            .where((s) => s.isNotEmpty)
                            .toList();
                        final projects = List<UserProject>.from(user.projects);
                        if (pTitleCtrl.text.trim().isNotEmpty) {
                          projects.add(
                            UserProject(
                              title: pTitleCtrl.text.trim(),
                              description: pDescCtrl.text.trim(),
                              link: pLinkCtrl.text.trim().isEmpty
                                  ? null
                                  : pLinkCtrl.text.trim(),
                            ),
                          );
                        }
                        try {
                          await sl<ProfileRemoteDataSource>().updateProfile(
                            uid: uid,
                            fullName: nameCtrl.text.trim(),
                            bio: bioCtrl.text.trim(),
                            skills: skills,
                            projects: projects,
                            githubUrl: ghCtrl.text.trim().isEmpty ? null : ghCtrl.text.trim(),
                            linkedinUrl: liCtrl.text.trim().isEmpty ? null : liCtrl.text.trim(),
                            websiteUrl: webCtrl.text.trim().isEmpty ? null : webCtrl.text.trim(),
                          );
                          if (ctx.mounted) Navigator.pop(ctx);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text('✓ Profile updated successfully'),
                                backgroundColor: Color(0xFF3E7BFA),
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          }
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text('Error: $e'),
                                backgroundColor: Colors.red,
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          }
                        }
                      },
                      style: FilledButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const Text(
                        'Save Changes',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => Navigator.pop(ctx),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: const Text(
                        'Cancel',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildEditSection({
    required BuildContext context,
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(
              icon,
              color: Theme.of(context).colorScheme.primary,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              title,
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        ...children,
      ],
    );
  }

  Widget _buildEditTextField(
    BuildContext context, {
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    int maxLines = 1,
  }) {
    return TextField(
      controller: controller,
      maxLines: maxLines,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(
          icon,
          color: Theme.of(context).colorScheme.primary.withOpacity(0.7),
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary.withOpacity(0.3),
          ),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary.withOpacity(0.2),
          ),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: Theme.of(context).colorScheme.primary,
            width: 2,
          ),
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }
}