import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../domain/entities/job.dart';
import '../bloc/jobs_bloc.dart';
import 'create_job_page.dart';
import 'job_applicants_page.dart';

class JobsPage extends StatefulWidget {
  const JobsPage({super.key});

  @override
  State<JobsPage> createState() => _JobsPageState();
}

class _JobsPageState extends State<JobsPage> {
  String? _lastLoadedKey;

  @override
  Widget build(BuildContext context) {
    final authUser = context.watch<AuthBloc>().state.user;
    if (authUser == null) {
      return const Center(child: Text('Sign in to view jobs.'));
    }

    return BlocConsumer<JobsBloc, JobsState>(
      listener: (context, state) {
        final message = state.errorMessage ?? state.infoMessage;
        if (message != null && message.isNotEmpty) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(message)),
          );
          context.read<JobsBloc>().add(const JobsClearMessage());
        }
      },
      builder: (context, state) {
        _loadJobsIfNeeded(context, authUser);

        if (state.isLoading && state.jobs.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        return ListView(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
          children: [
            _JobsHeader(authUser: authUser),
            const SizedBox(height: 10),
            if (authUser.role == UserRole.recruiter)
              _RecruiterActions(
                onCreateJob: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const CreateJobPage(),
                    ),
                  );
                },
              ),
            const SizedBox(height: 10),
            if (state.jobs.isEmpty)
              _emptyState(context, authUser.role)
            else
              ...state.jobs.map(
                (job) => _JobCard(
                  job: job,
                  isRecruiter: authUser.role == UserRole.recruiter,
                  isApplying: state.isApplying,
                  isSubmitting: state.isSubmitting,
                  onApply: () => _showApplySheet(context, job.id),
                  onDelete: () => _confirmDelete(context, job.id),
                  onViewApplicants: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => JobApplicantsPage(jobId: job.id),
                      ),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }

  void _loadJobsIfNeeded(BuildContext context, AppUser authUser) {
    final jobsBloc = context.read<JobsBloc>();
    if (authUser.role == UserRole.student) {
      final key = 'student_${authUser.id}';
      if (_lastLoadedKey != key) {
        _lastLoadedKey = key;
        jobsBloc.add(JobsStartFeed(authUser.id));
      }
      return;
    }

    final keyPrefix = 'recruiter_${authUser.id}_';
    if (_lastLoadedKey?.startsWith(keyPrefix) == true) return;

    FirebaseFirestore.instance
        .collection('companies')
        .where('ownerId', isEqualTo: authUser.id)
        .limit(1)
        .get()
        .then((snap) {
      if (!mounted || snap.docs.isEmpty) return;
      final companyId = snap.docs.first.id;
      final key = '$keyPrefix$companyId';
      if (_lastLoadedKey == key) return;
      _lastLoadedKey = key;
      jobsBloc.add(JobsStartRecruiterJobs(companyId));
    });
  }

  Future<void> _showApplySheet(BuildContext context, String jobId) async {
    final messageController = TextEditingController();
    String? pickedPath;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (sheetContext, setModalState) {
            final state = context.watch<JobsBloc>().state;
            return Padding(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 8,
                bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 16,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Apply to job',
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: state.isApplying
                        ? null
                        : () async {
                            final result = await FilePicker.platform.pickFiles(
                              type: FileType.custom,
                              allowedExtensions: const ['pdf', 'doc', 'docx'],
                            );
                            if (result == null ||
                                result.files.isEmpty ||
                                result.files.single.path == null) {
                              return;
                            }
                            setModalState(() {
                              pickedPath = result.files.single.path;
                            });
                          },
                    icon: const Icon(Icons.upload_file_outlined),
                    label: Text(
                      pickedPath == null ? 'Choose CV' : 'CV selected',
                    ),
                  ),
                  if (pickedPath != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        pickedPath!.split('\\').last,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: messageController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Message (optional)',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: state.isApplying
                              ? null
                              : () => Navigator.pop(sheetContext),
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: state.isApplying || pickedPath == null
                              ? null
                              : () {
                                  context.read<JobsBloc>().add(
                                        JobsApplyRequested(
                                          jobId: jobId,
                                          cvFilePath: pickedPath!,
                                          message:
                                              messageController.text.trim(),
                                        ),
                                      );
                                  Navigator.pop(sheetContext);
                                },
                          child: const Text('Apply'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Future<void> _confirmDelete(BuildContext context, String jobId) async {
    final shouldDelete = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Delete job?'),
        content: const Text('This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(dialogContext, true),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (shouldDelete == true && context.mounted) {
      context.read<JobsBloc>().add(JobsDeleteRequested(jobId));
    }
  }

  Widget _emptyState(BuildContext context, UserRole role) {
    final text = role == UserRole.student
        ? 'Follow companies to see matching jobs here.'
        : 'No jobs yet. Create your first job post.';

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Row(
          children: [
            const Icon(Icons.work_outline),
            const SizedBox(width: 10),
            Expanded(child: Text(text)),
          ],
        ),
      ),
    );
  }
}

class _JobsHeader extends StatelessWidget {
  const _JobsHeader({required this.authUser});

  final AppUser authUser;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              authUser.role == UserRole.student ? 'Jobs For You' : 'Recruiter Jobs',
              style: Theme.of(
                context,
              ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 6),
            Text(
              authUser.role == UserRole.student
                  ? 'Real-time jobs from companies you follow.'
                  : 'Manage your jobs and review applicants.',
            ),
          ],
        ),
      ),
    );
  }
}

class _RecruiterActions extends StatelessWidget {
  const _RecruiterActions({
    required this.onCreateJob,
  });

  final VoidCallback onCreateJob;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: FilledButton.icon(
        onPressed: onCreateJob,
        icon: const Icon(Icons.add),
        label: const Text('Create job'),
      ),
    );
  }
}

class _JobCard extends StatelessWidget {
  const _JobCard({
    required this.job,
    required this.isRecruiter,
    required this.isApplying,
    required this.isSubmitting,
    required this.onApply,
    required this.onDelete,
    required this.onViewApplicants,
  });

  final Job job;
  final bool isRecruiter;
  final bool isApplying;
  final bool isSubmitting;
  final VoidCallback onApply;
  final VoidCallback onDelete;
  final VoidCallback onViewApplicants;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.symmetric(vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              job.companyName,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    color: Theme.of(context).colorScheme.primary,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              job.title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 4),
            Text(job.location),
            const SizedBox(height: 6),
            Text(
              _formatTimeAgo(job.createdAt),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: -8,
              children: job.skills
                  .map((skill) => Chip(label: Text(skill)))
                  .toList(),
            ),
            const SizedBox(height: 12),
            if (isRecruiter)
              Row(
                children: [
                  OutlinedButton.icon(
                    onPressed: isSubmitting ? null : onViewApplicants,
                    icon: const Icon(Icons.group_outlined, size: 18),
                    label: const Text('Applicants'),
                  ),
                  const SizedBox(width: 8),
                  FilledButton.tonalIcon(
                    onPressed: isSubmitting ? null : onDelete,
                    icon: const Icon(Icons.delete_outline, size: 18),
                    label: const Text('Delete'),
                  ),
                ],
              )
            else
              Align(
                alignment: Alignment.centerLeft,
                child: FilledButton(
                  onPressed: isApplying ? null : onApply,
                  child: const Text('Apply'),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _formatTimeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);
    if (diff.inMinutes < 1) return 'Just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes} minutes ago';
    if (diff.inHours < 24) return '${diff.inHours} hours ago';
    return '${diff.inDays} days ago';
  }
}
