import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

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
  bool _streamStarted = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _startStreamIfNeeded();
  }

  void _startStreamIfNeeded() {
    if (_streamStarted) return;
    final authUser = context.read<AuthBloc>().state.user;
    if (authUser == null) return;

    _streamStarted = true;
    final bloc = context.read<JobsBloc>();

    if (authUser.role == UserRole.student) {
      bloc.add(JobsStartFeed(authUser.id));
    } else {
      bloc.add(JobsStartRecruiterJobs(authUser.id));
    }
  }

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
        if (state.isLoading) {
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
                  // ✅ Stream auto-updates via Firestore snapshots
                  // No manual refresh needed
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
                  onApply: () => _showApplySheet(context, job),
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

  Future<void> _showApplySheet(BuildContext context, Job job) async {
    final authUser = context.read<AuthBloc>().state.user;
    if (authUser == null) return;

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (sheetContext) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 8,
            bottom: MediaQuery.of(sheetContext).viewInsets.bottom + 24,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Apply to: ${job.title}',
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 4),
              Text(
                'Posted by ${job.recruiterName}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              const SizedBox(height: 20),
              if (job.formUrl != null && job.formUrl!.isNotEmpty)
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    icon: const Icon(Icons.open_in_new),
                    label: const Text('Open Application Form'),
                    onPressed: () async {
                      // ✅ Close sheet first
                      Navigator.pop(sheetContext);

                      // ✅ Launch URL immediately — no Firestore write needed
                      final uri = Uri.tryParse(job.formUrl!);
                      if (uri != null && await canLaunchUrl(uri)) {
                        await launchUrl(
                          uri,
                          mode: LaunchMode.externalApplication,
                        );
                      } else {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Could not open the form URL.'),
                            ),
                          );
                        }
                      }
                    },
                  ),
                )
              else
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'No application form available for this job.',
                    style: TextStyle(color: Colors.grey),
                  ),
                ),
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.pop(sheetContext),
                  child: const Text('Cancel'),
                ),
              ),
            ],
          ),
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
        ? 'Connect with a recruiter to see their jobs here.'
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
              authUser.role == UserRole.student ? 'Jobs For You' : 'My Jobs',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 6),
            Text(
              authUser.role == UserRole.student
                  ? 'Jobs from recruiters you are connected with.'
                  : 'Manage your jobs and review applicants.',
            ),
          ],
        ),
      ),
    );
  }
}

class _RecruiterActions extends StatelessWidget {
  const _RecruiterActions({required this.onCreateJob});

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
            Row(
              children: [
                if (job.recruiterAvatarUrl != null)
                  CircleAvatar(
                    radius: 14,
                    backgroundImage: NetworkImage(job.recruiterAvatarUrl!),
                  ),
                if (job.recruiterAvatarUrl != null) const SizedBox(width: 8),
                Text(
                  job.recruiterName,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: Theme.of(context).colorScheme.primary,
                      ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              job.title,
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 4),
            Text(job.location),
            const SizedBox(height: 4),
            Text(
              '${job.jobType} • ${job.salaryRange}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 6),
            Text(
              _formatTimeAgo(job.createdAt),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const SizedBox(height: 10),
            Wrap(
              spacing: 6,
              runSpacing: -8,
              children:
                  job.skills.map((skill) => Chip(label: Text(skill))).toList(),
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