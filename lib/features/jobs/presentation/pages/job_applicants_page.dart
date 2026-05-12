import 'package:flutter/material.dart';
import 'package:unilink/features/profile/presentation/pages/profile_page.dart';

import '../../../../core/config/injection_container.dart';
import '../../data/datasources/jobs_remote_datasource.dart';
import '../../domain/entities/job_application.dart';
import '../../domain/usecases/stream_job_applications.dart';

class JobApplicantsPage extends StatefulWidget {
  const JobApplicantsPage({super.key, required this.jobId});

  final String jobId;

  @override
  State<JobApplicantsPage> createState() => _JobApplicantsPageState();
}

class _JobApplicantsPageState extends State<JobApplicantsPage> {
  // ✅ FIXED: stream created ONCE in initState and stored here.
  // The old StatelessWidget called sl<StreamJobApplications>().call(jobId)
  // inside build() — every rebuild produced a brand-new stream, so
  // StreamBuilder restarted from scratch and only the first Firestore
  // emission was ever delivered. Holding the stream in state means the
  // same subscription lives for the full lifetime of this page.
  late final Stream<List<JobApplication>> _stream;

  @override
  void initState() {
    super.initState();
    _stream = sl<StreamJobApplications>().call(widget.jobId);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Applicants')),
      body: StreamBuilder<List<JobApplication>>(
        stream: _stream,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }

          final applicants = snapshot.data ?? [];

          if (applicants.isEmpty) {
            return const Center(child: Text('No applicants yet.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: applicants.length,
            itemBuilder: (context, index) {
              final app = applicants[index];
              return _ApplicantCard(
                app: app,
                onUpdateStatus: (status) =>
                    _updateStatus(context, app.id, status),
                // ✅ NEW: tap card → navigate to student's profile
                onViewProfile: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => ProfilePage(userId: app.studentId),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }

  Future<void> _updateStatus(
    BuildContext context,
    String applicationId,
    String status,
  ) async {
    try {
      await sl<JobsRemoteDataSource>().updateApplicationStatus(
        applicationId: applicationId,
        status: status,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              status == 'accepted'
                  ? 'Applicant accepted ✓'
                  : 'Applicant rejected',
            ),
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
  }
}

class _ApplicantCard extends StatelessWidget {
  const _ApplicantCard({
    required this.app,
    required this.onUpdateStatus,
    required this.onViewProfile,
  });

  final JobApplication app;
  final void Function(String status) onUpdateStatus;
  final VoidCallback onViewProfile;

  @override
  Widget build(BuildContext context) {
    Color statusColor = Colors.orange;
    if (app.status == 'accepted') statusColor = Colors.green;
    if (app.status == 'rejected') statusColor = Colors.red;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      // ✅ NEW: entire card is tappable → opens student profile
      child: InkWell(
        onTap: onViewProfile,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      app.studentName,
                      style: Theme.of(context)
                          .textTheme
                          .titleMedium
                          ?.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: statusColor),
                    ),
                    child: Text(
                      app.status.toUpperCase(),
                      style: TextStyle(
                        color: statusColor,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              // ✅ NEW: hint that card is tappable
              Text(
                'Tap to view profile',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.primary,
                    ),
              ),
              const SizedBox(height: 4),
              Text(
                'Applied via external form',
                style: Theme.of(context).textTheme.bodySmall,
              ),
              if (app.status == 'pending') ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => onUpdateStatus('rejected'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.red,
                          side: const BorderSide(color: Colors.red),
                        ),
                        child: const Text('Reject'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: FilledButton(
                        onPressed: () => onUpdateStatus('accepted'),
                        style: FilledButton.styleFrom(
                          backgroundColor: Colors.green,
                        ),
                        child: const Text('Accept'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}