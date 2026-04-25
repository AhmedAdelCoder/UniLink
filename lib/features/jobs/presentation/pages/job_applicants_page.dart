import 'package:flutter/material.dart';

import '../../../../core/config/injection_container.dart';
import '../../domain/usecases/stream_job_applications.dart';

class JobApplicantsPage extends StatelessWidget {
  const JobApplicantsPage({
    super.key,
    required this.jobId,
  });

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
              return Card(
                child: ListTile(
                  title: Text(app.studentName),
                  subtitle: Text(
                    app.message.isEmpty ? 'No message added' : app.message,
                  ),
                  trailing: IconButton(
                    icon: const Icon(Icons.link_outlined),
                    tooltip: 'CV link',
                    onPressed: () {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(content: Text(app.cvUrl)),
                      );
                    },
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
