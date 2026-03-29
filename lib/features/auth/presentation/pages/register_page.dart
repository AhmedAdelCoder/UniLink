import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
// ignore: unused_import
import '../../../request/request.dart';
import '../../../../core/utils/input_validators.dart';
import '../../domain/entities/app_user.dart';
import '../bloc/auth_bloc.dart';

class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  static const routeName = '/register';

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  UserRole _role = UserRole.student;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _onRegisterPressed() {
    if (!_formKey.currentState!.validate()) return;

    context.read<AuthBloc>().add(
      AuthRegisterRequested(
        name: _nameController.text.trim(),
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
        role: _role,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: BlocConsumer<AuthBloc, AuthState>(
                listener: (context, state) async{
                  /// ❌ لو في error
                  if (state.status == AuthStatus.failure) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          state.errorMessage ?? "Register failed",
                        ),
                      ),
                    );
                  }

                  /// ✅ لو نجح
                  if (state.status == AuthStatus.authenticated) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text("Account Created Successfully"),
                      ),
                    );
                    await sendWelcomeEmail(
                      state.user?.email ?? _emailController.text.trim(),
                      state.user?.fullName ?? _nameController.text.trim(),
                    );

                    Navigator.pop(context); // يرجع لل login
                  }
                },
                builder: (context, state) {
                  final isLoading = state.status == AuthStatus.loading;

                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            /// Name
                            TextFormField(
                              controller: _nameController,
                              decoration: const InputDecoration(
                                labelText: 'Full name',
                              ),
                              validator: InputValidators.validateName,
                            ),

                            const SizedBox(height: 16),

                            /// Email
                            TextFormField(
                              controller: _emailController,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                              ),
                              keyboardType: TextInputType.emailAddress,
                              validator: InputValidators.validateEmail,
                            ),

                            const SizedBox(height: 16),

                            /// Password
                            TextFormField(
                              controller: _passwordController,
                              decoration: const InputDecoration(
                                labelText: 'Password',
                              ),
                              obscureText: true,
                              validator: InputValidators.validatePassword,
                            ),

                            const SizedBox(height: 24),

                            /// Role
                            Text(
                              'Role',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),

                            const SizedBox(height: 8),

                            SegmentedButton<UserRole>(
                              segments: const [
                                ButtonSegment(
                                  value: UserRole.student,
                                  label: Text('Student'),
                                  icon: Icon(Icons.school),
                                ),
                                ButtonSegment(
                                  value: UserRole.recruiter,
                                  label: Text('Recruiter'),
                                  icon: Icon(Icons.business_center),
                                ),
                              ],
                              selected: {_role},
                              onSelectionChanged: (value) {
                                setState(() {
                                  _role = value.first;
                                });
                              },
                            ),

                            const SizedBox(height: 24),

                            /// Register Button
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton(
                                onPressed:
                                    isLoading ? null : _onRegisterPressed,
                                child: isLoading
                                    ? const SizedBox(
                                        height: 18,
                                        width: 18,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          valueColor:
                                              AlwaysStoppedAnimation<Color>(
                                            Colors.white,
                                          ),
                                        ),
                                      )
                                    : const Text('Create account'),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}