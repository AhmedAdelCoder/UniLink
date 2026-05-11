import 'package:flutter/material.dart';

import '../../../../core/config/injection_container.dart';
import '../../data/datasources/jobs_remote_datasource.dart';
import '../../domain/usecases/stream_job_applications.dart';

class JobApplicantsPage extends StatelessWidget {
  const JobApplicantsPage({super.key, required this.jobId});

  final String jobId;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Applicants')),
      body: StreamBuilder(
        stream: sl<StreamJobApplications>().call(jobId),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final applicants = snapshot.data!;

          if (applicants.isEmpty) {
            return const Center(child: Text('No applicants yet.'));
          }

          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: applicants.length,
            itemBuilder: (context, index) {
              final app = applicants[index];

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
                      const SizedBox(height: 8),
                      Text(
                        'Applied via external form',
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                      // ✅ Only show accept/reject if still pending
                      if (app.status == 'pending') ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton(
                                onPressed: () => _updateStatus(
                                  context,
                                  app.id,
                                  'rejected',
                                ),
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
                                onPressed: () => _updateStatus(
                                  context,
                                  app.id,
                                  'accepted',
                                ),
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