import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../bloc/jobs_bloc.dart';

class CreateJobPage extends StatefulWidget {
  const CreateJobPage({super.key});

  @override
  State<CreateJobPage> createState() => _CreateJobPageState();
}

class _CreateJobPageState extends State<CreateJobPage> {
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _skillsCtrl = TextEditingController();
  final _jobTypeCtrl = TextEditingController();
  final _salaryCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    _skillsCtrl.dispose();
    _jobTypeCtrl.dispose();
    _salaryCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  void _submit(BuildContext context) {
    if (!_formKey.currentState!.validate()) return;

    final skills = _skillsCtrl.text
        .split(',')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();

    if (skills.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("Please enter at least one skill")),
      );
      return;
    }

    print("🔥 POST JOB CLICKED");

    context.read<JobsBloc>().add(
          JobsCreateRequested(
            title: _titleCtrl.text.trim(),
            description: _descriptionCtrl.text.trim(),
            skills: skills,
            jobType: _jobTypeCtrl.text.trim(),
            salaryRange: _salaryCtrl.text.trim(),
            location: _locationCtrl.text.trim(),
          ),
        );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create Job')),
      body: BlocListener<JobsBloc, JobsState>(
        listener: (context, state) {
          print("📦 STATE: ${state.infoMessage} | ${state.errorMessage}");

          if (state.errorMessage != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(state.errorMessage!),
                backgroundColor: Colors.red,
              ),
            );
          }

          if (state.infoMessage != null) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(state.infoMessage!)),
            );
          }

          if (state.infoMessage == 'Job posted successfully.') {
            Navigator.pop(context);
          }
        },
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              children: [
                TextFormField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(labelText: 'Job title'),
                  validator: (value) =>
                      value == null || value.trim().isEmpty
                          ? 'Required'
                          : null,
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _descriptionCtrl,
                  minLines: 4,
                  maxLines: 6,
                  decoration: const InputDecoration(labelText: 'Description'),
                  validator: (value) =>
                      value == null || value.trim().isEmpty
                          ? 'Required'
                          : null,
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _skillsCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Skills (comma separated)',
                  ),
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _jobTypeCtrl,
                  decoration: const InputDecoration(labelText: 'Job type'),
                  validator: (value) =>
                      value == null || value.trim().isEmpty
                          ? 'Required'
                          : null,
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _salaryCtrl,
                  decoration: const InputDecoration(labelText: 'Salary range'),
                  validator: (value) =>
                      value == null || value.trim().isEmpty
                          ? 'Required'
                          : null,
                ),
                const SizedBox(height: 12),

                TextFormField(
                  controller: _locationCtrl,
                  decoration: const InputDecoration(labelText: 'Location'),
                  validator: (value) =>
                      value == null || value.trim().isEmpty
                          ? 'Required'
                          : null,
                ),
                const SizedBox(height: 20),

                BlocBuilder<JobsBloc, JobsState>(
                  builder: (context, state) {
                    return SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: state.isSubmitting
                            ? null
                            : () => _submit(context),
                        child: state.isSubmitting
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : const Text('Post job'),
                      ),
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}