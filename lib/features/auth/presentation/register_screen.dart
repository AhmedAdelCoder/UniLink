import 'package:flutter/material.dart';
import 'package:unilink/core/errors/failures.dart';
import 'package:unilink/features/auth/domain/entities/app_user.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.onRegisterSuccess});
  static const routeName = '/register';
  final VoidCallback onRegisterSuccess;
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  String _role = 'student';
  bool _isLoading = false;
  
  get authRepository => null;
  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

 Future<void> _onRegister() async {
  if (!_formKey.currentState!.validate()) return;

  setState(() => _isLoading = true);

  // استدعي الـ repository للتسجيل
  final result = await authRepository.register(
    name: _nameController.text.trim(),
    email: _emailController.text.trim(),
    password: _passwordController.text,
    role: _role == 'student' ? UserRole.student : UserRole.recruiter,
  );

  setState(() => _isLoading = false);

  if (!mounted) return;

  result.fold(
    (failure) {
      // لو فيه خطأ، اعرض Snackbar بالرسالة
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(failure is AuthFailure ? failure.message : 'Unexpected error')),
      );
    },
    (user) {
      // لو ناجح، نفذ الـ callback للانتقال للصفحة التالية
      widget.onRegisterSuccess();
    },
  );
}
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Create account')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Form(
                  key: _formKey,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextFormField(
                        controller: _nameController,
                        decoration: const InputDecoration(
                          labelText: 'Full name',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Please enter your name';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _emailController,
                        decoration: const InputDecoration(labelText: 'Email'),
                        keyboardType: TextInputType.emailAddress,
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter your email';
                          }
                          if (!value.contains('@')) {
                            return 'Please enter a valid email';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _passwordController,
                        decoration: const InputDecoration(
                          labelText: 'Password',
                        ),
                        obscureText: true,
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter a password';
                          }
                          if (value.length < 6) {
                            return 'Password must be at least 6 characters';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 24),
                      Text(
                        'Role',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                            value: 'student',
                            label: Text('Student'),
                            icon: Icon(Icons.school),
                          ),
                          ButtonSegment(
                            value: 'recruiter',
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
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton(
                          onPressed: _isLoading ? null : _onRegister,
                          child: _isLoading
                              ? const SizedBox(
                                  height: 18,
                                  width: 18,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    valueColor: AlwaysStoppedAnimation<Color>(
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
            ),
          ),
        ),
      ),
    );
  }
}
