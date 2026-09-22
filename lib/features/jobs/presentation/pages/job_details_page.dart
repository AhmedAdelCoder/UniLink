// import 'package:flutter/material.dart';

// import '../../domain/entities/job.dart';

// class JobDetailsPage extends StatelessWidget {
//   const JobDetailsPage({
//     super.key,
//     required this.job,
//   });

//   final Job job;

//   @override
//   Widget build(BuildContext context) {
//     return Scaffold(
//       backgroundColor: const Color(0xFFF4F6FA),

//       body: CustomScrollView(
//         slivers: [
//           // ------------------------------------------------------------
//           // TOP HEADER + HERO
//           // ------------------------------------------------------------
//           SliverAppBar(
//             expandedHeight: 230,
//             pinned: true,
//             backgroundColor: const Color(0xFF0066FF),
//             foregroundColor: Colors.white,

//             leading: Padding(
//               padding: const EdgeInsets.all(8),
//               child: CircleAvatar(
//                 backgroundColor: Colors.white,
//                 child: IconButton(
//                   icon: const Icon(
//                     Icons.arrow_back,
//                     color: Color(0xFF0F172A),
//                   ),
//                   onPressed: () => Navigator.pop(context),
//                 ),
//               ),
//             ),

//             actions: [
//               Padding(
//                 padding: const EdgeInsets.all(8),
//                 child: CircleAvatar(
//                   backgroundColor: Colors.white,
//                   child: IconButton(
//                     icon: const Icon(
//                       Icons.bookmark_border,
//                       color: Color(0xFF0F172A),
//                     ),
//                     onPressed: () {
//                       // Favorite functionality can be added later.
//                     },
//                   ),
//                 ),
//               ),
//             ],

//             flexibleSpace: FlexibleSpaceBar(
//               background: Container(
//                 decoration: const BoxDecoration(
//                   gradient: LinearGradient(
//                     begin: Alignment.topLeft,
//                     end: Alignment.bottomRight,
//                     colors: [
//                       Color(0xFF0066FF),
//                       Color(0xFF3B82F6),
//                     ],
//                   ),
//                 ),
//                 child: Center(
//                   child: job.recruiterAvatarUrl != null &&
//                           job.recruiterAvatarUrl!.isNotEmpty
//                       ? CircleAvatar(
//                           radius: 48,
//                           backgroundColor: Colors.white,
//                           backgroundImage:
//                               NetworkImage(job.recruiterAvatarUrl!),
//                         )
//                       : const CircleAvatar(
//                           radius: 48,
//                           backgroundColor: Colors.white,
//                           child: Icon(
//                             Icons.business,
//                             size: 48,
//                             color: Color(0xFF0066FF),
//                           ),
//                         ),
//                 ),
//               ),
//             ),
//           ),

//           // ------------------------------------------------------------
//           // PAGE CONTENT
//           // ------------------------------------------------------------
//           SliverToBoxAdapter(
//             child: Transform.translate(
//               offset: const Offset(0, -20),
//               child: Container(
//                 decoration: const BoxDecoration(
//                   color: Color(0xFFF4F6FA),
//                   borderRadius: BorderRadius.vertical(
//                     top: Radius.circular(24),
//                   ),
//                 ),
//                 child: Padding(
//                   padding: const EdgeInsets.fromLTRB(16, 24, 16, 110),
//                   child: Column(
//                     crossAxisAlignment: CrossAxisAlignment.start,
//                     children: [

//                       // --------------------------------------------------
//                       // COMPANY + JOB TITLE
//                       // --------------------------------------------------
//                       Container(
//                         width: double.infinity,
//                         padding: const EdgeInsets.all(18),
//                         decoration: BoxDecoration(
//                           color: Colors.white,
//                           borderRadius: BorderRadius.circular(20),
//                           boxShadow: [
//                             BoxShadow(
//                               color: Colors.black.withValues(alpha: 0.06),
//                               blurRadius: 15,
//                               offset: const Offset(0, 5),
//                             ),
//                           ],
//                         ),
//                         child: Column(
//                           crossAxisAlignment: CrossAxisAlignment.start,
//                           children: [

//                             Row(
//                               children: [
//                                 CircleAvatar(
//                                   radius: 24,
//                                   backgroundColor: const Color(0xFFE8F0FF),
//                                   backgroundImage:
//                                       job.recruiterAvatarUrl != null &&
//                                               job.recruiterAvatarUrl!.isNotEmpty
//                                           ? NetworkImage(
//                                               job.recruiterAvatarUrl!,
//                                             )
//                                           : null,
//                                   child: job.recruiterAvatarUrl == null ||
//                                           job.recruiterAvatarUrl!.isEmpty
//                                       ? const Icon(
//                                           Icons.business,
//                                           color: Color(0xFF0066FF),
//                                         )
//                                       : null,
//                                 ),

//                                 const SizedBox(width: 12),

//                                 Expanded(
//                                   child: Row(
//                                     children: [
//                                       Flexible(
//                                         child: Text(
//                                           job.recruiterName,
//                                           style: const TextStyle(
//                                             fontSize: 16,
//                                             fontWeight: FontWeight.w600,
//                                             color: Color(0xFF0F172A),
//                                           ),
//                                         ),
//                                       ),
//                                       const SizedBox(width: 5),
//                                       const Icon(
//                                         Icons.verified,
//                                         size: 18,
//                                         color: Color(0xFF0066FF),
//                                       ),
//                                     ],
//                                   ),
//                                 ),
//                               ],
//                             ),

//                             const SizedBox(height: 18),

//                             Text(
//                               job.title,
//                               style: const TextStyle(
//                                 fontSize: 26,
//                                 fontWeight: FontWeight.bold,
//                                 color: Color(0xFF0F172A),
//                               ),
//                             ),

//                             const SizedBox(height: 20),

//                             // Location
//                             _DetailRow(
//                               icon: Icons.location_on_outlined,
//                               text: job.location,
//                             ),

//                             const SizedBox(height: 12),

//                             // Job Type
//                             _DetailRow(
//                               icon: Icons.access_time_outlined,
//                               text: job.jobType,
//                             ),

//                             const SizedBox(height: 12),

//                             // Salary
//                             _DetailRow(
//                               icon: Icons.attach_money,
//                               text: job.salaryRange,
//                             ),
//                           ],
//                         ),
//                       ),

//                       const SizedBox(height: 24),

//                       // --------------------------------------------------
//                       // BENEFITS
//                       // --------------------------------------------------
//                       const Text(
//                         'Benefits',
//                         style: TextStyle(
//                           fontSize: 20,
//                           fontWeight: FontWeight.bold,
//                           color: Color(0xFF0F172A),
//                         ),
//                       ),

//                       const SizedBox(height: 12),

//                       Row(
//                         children: [
//                           Expanded(
//                             child: _BenefitCard(
//                               icon: Icons.health_and_safety_outlined,
//                               title: 'Health',
//                             ),
//                           ),
//                           const SizedBox(width: 8),
//                           Expanded(
//                             child: _BenefitCard(
//                               icon: Icons.account_balance_outlined,
//                               title: 'Finance',
//                             ),
//                           ),
//                           const SizedBox(width: 8),
//                           Expanded(
//                             child: _BenefitCard(
//                               icon: Icons.calendar_month_outlined,
//                               title: 'Flexible',
//                             ),
//                           ),
//                           const SizedBox(width: 8),
//                           Expanded(
//                             child: _BenefitCard(
//                               icon: Icons.home_outlined,
//                               title: 'Remote',
//                             ),
//                           ),
//                         ],
//                       ),

//                       const SizedBox(height: 28),

//                       // --------------------------------------------------
//                       // JOB DESCRIPTION
//                       // --------------------------------------------------
//                       const Text(
//                         'Job Description',
//                         style: TextStyle(
//                           fontSize: 20,
//                           fontWeight: FontWeight.bold,
//                           color: Color(0xFF0F172A),
//                         ),
//                       ),

//                       const SizedBox(height: 10),

//                       Text(
//                         job.description,
//                         style: const TextStyle(
//                           fontSize: 15,
//                           height: 1.6,
//                           color: Color(0xFF64748B),
//                         ),
//                       ),

//                       const SizedBox(height: 28),

//                       // --------------------------------------------------
//                       // AI MATCH SCORE
//                       // --------------------------------------------------
//                       Container(
//                         padding: const EdgeInsets.all(18),
//                         decoration: BoxDecoration(
//                           color: const Color(0xFFE8F0FF),
//                           borderRadius: BorderRadius.circular(18),
//                         ),
//                         child: Row(
//                           children: [
//                             const Icon(
//                               Icons.auto_awesome,
//                               size: 32,
//                               color: Color(0xFF0066FF),
//                             ),

//                             const SizedBox(width: 12),

//                             const Expanded(
//                               child: Column(
//                                 crossAxisAlignment:
//                                     CrossAxisAlignment.start,
//                                 children: [
//                                   Text(
//                                     'AI Match Score',
//                                     style: TextStyle(
//                                       fontSize: 17,
//                                       fontWeight: FontWeight.bold,
//                                       color: Color(0xFF0F172A),
//                                     ),
//                                   ),
//                                   SizedBox(height: 4),
//                                   Text(
//                                     "You're a great fit for this role based on your skills and experience.",
//                                     style: TextStyle(
//                                       fontSize: 13,
//                                       color: Color(0xFF64748B),
//                                       height: 1.4,
//                                     ),
//                                   ),
//                                 ],
//                               ),
//                             ),

//                             const SizedBox(width: 12),

//                             SizedBox(
//                               width: 62,
//                               height: 62,
//                               child: Stack(
//                                 alignment: Alignment.center,
//                                 children: [
//                                   CircularProgressIndicator(
//                                     value: 0.92,
//                                     strokeWidth: 6,
//                                     backgroundColor: Colors.white,
//                                     valueColor:
//                                         const AlwaysStoppedAnimation(
//                                       Color(0xFF0066FF),
//                                     ),
//                                   ),
//                                   const Text(
//                                     '92%',
//                                     style: TextStyle(
//                                       fontSize: 13,
//                                       fontWeight: FontWeight.bold,
//                                       color: Color(0xFF0F172A),
//                                     ),
//                                   ),
//                                 ],
//                               ),
//                             ),
//                           ],
//                         ),
//                       ),

//                       const SizedBox(height: 28),

//                       // --------------------------------------------------
//                       // KEY SKILLS
//                       // --------------------------------------------------
//                       const Text(
//                         'Key Skills',
//                         style: TextStyle(
//                           fontSize: 20,
//                           fontWeight: FontWeight.bold,
//                           color: Color(0xFF0F172A),
//                         ),
//                       ),

//                       const SizedBox(height: 12),

//                       Wrap(
//                         spacing: 8,
//                         runSpacing: 8,
//                         children: job.skills.map((skill) {
//                           return Container(
//                             padding: const EdgeInsets.symmetric(
//                               horizontal: 14,
//                               vertical: 9,
//                             ),
//                             decoration: BoxDecoration(
//                               color: const Color(0xFFE8F0FF),
//                               borderRadius: BorderRadius.circular(20),
//                               border: Border.all(
//                                 color: const Color(0xFFD6E4FF),
//                               ),
//                             ),
//                             child: Text(
//                               skill,
//                               style: const TextStyle(
//                                 color: Color(0xFF0F172A),
//                                 fontWeight: FontWeight.w500,
//                               ),
//                             ),
//                           );
//                         }).toList(),
//                       ),
//                     ],
//                   ),
//                 ),
//               ),
//             ),
//           ),
//         ],
//       ),

//       // ------------------------------------------------------------
//       // BOTTOM APPLY BAR
//       // ------------------------------------------------------------
//       bottomNavigationBar: SafeArea(
//         child: Container(
//           padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
//           decoration: const BoxDecoration(
//             color: Colors.white,
//           ),
//           child: Row(
//             children: [
//               Expanded(
//                 child: FilledButton.icon(
//                   onPressed: () {
//                     // We will connect this to your existing
//                     // JobsApplyRequested flow in the next step.
//                   },
//                   icon: const Icon(Icons.send_outlined),
//                   label: const Text(
//                     'Apply Now',
//                     style: TextStyle(
//                       fontSize: 16,
//                       fontWeight: FontWeight.bold,
//                     ),
//                   ),
//                   style: FilledButton.styleFrom(
//                     backgroundColor: const Color(0xFF0066FF),
//                     padding: const EdgeInsets.symmetric(vertical: 16),
//                     shape: RoundedRectangleBorder(
//                       borderRadius: BorderRadius.circular(30),
//                     ),
//                   ),
//                 ),
//               ),

//               const SizedBox(width: 10),

//               Container(
//                 width: 52,
//                 height: 52,
//                 decoration: BoxDecoration(
//                   color: Colors.white,
//                   shape: BoxShape.circle,
//                   border: Border.all(
//                     color: const Color(0xFFE2E8F0),
//                   ),
//                 ),
//                 child: IconButton(
//                   onPressed: () {
//                     // Favorite functionality can be added later.
//                   },
//                   icon: const Icon(
//                     Icons.favorite_border,
//                     color: Color(0xFF0F172A),
//                   ),
//                 ),
//               ),
//             ],
//           ),
//         ),
//       ),
//     );
//   }
// }

// // ================================================================
// // DETAIL ROW
// // ================================================================

// class _DetailRow extends StatelessWidget {
//   const _DetailRow({
//     required this.icon,
//     required this.text,
//   });

//   final IconData icon;
//   final String text;

//   @override
//   Widget build(BuildContext context) {
//     return Row(
//       children: [
//         Icon(
//           icon,
//           size: 21,
//           color: const Color(0xFF0066FF),
//         ),
//         const SizedBox(width: 10),
//         Expanded(
//           child: Text(
//             text,
//             style: const TextStyle(
//               fontSize: 15,
//               color: Color(0xFF64748B),
//             ),
//           ),
//         ),
//       ],
//     );
//   }
// }

// // ================================================================
// // BENEFIT CARD
// // ================================================================

// class _BenefitCard extends StatelessWidget {
//   const _BenefitCard({
//     required this.icon,
//     required this.title,
//   });

//   final IconData icon;
//   final String title;

//   @override
//   Widget build(BuildContext context) {
//     return Container(
//       height: 95,
//       padding: const EdgeInsets.all(8),
//       decoration: BoxDecoration(
//         color: const Color(0xFFE8F0FF),
//         borderRadius: BorderRadius.circular(14),
//         border: Border.all(
//           color: const Color(0xFFD6E4FF),
//         ),
//       ),
//       child: Column(
//         mainAxisAlignment: MainAxisAlignment.center,
//         children: [
//           Icon(
//             icon,
//             color: const Color(0xFF0066FF),
//             size: 26,
//           ),
//           const SizedBox(height: 7),
//           Text(
//             title,
//             textAlign: TextAlign.center,
//             style: const TextStyle(
//               fontSize: 11,
//               fontWeight: FontWeight.w600,
//               color: Color(0xFF0F172A),
//             ),
//           ),
//         ],
//       ),
//     );
//   }
// }

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../domain/entities/job.dart';
import '../bloc/jobs_bloc.dart';

/// Design tokens used across this screen.
class _JobColors {
  static const primary = Color(0xFF2563EB);
  static const ink = Color(0xFF0F172A);
  static const subtext = Color(0xFF64748B);
  static const background = Color(0xFFF4F6FA);
  static const benefitBg = Color(0xFFF3F4F6);
  static const benefitIconBg = Color(0xFFDBEAFE);
  static const matchCardBg = Color(0xFFEFF6FF);
  static const skillPillBg = Color(0xFFDBEAFE);
  static const skillPillBorder = Color(0xFFBFDBFE);
}

class JobDetailsPage extends StatelessWidget {
  const JobDetailsPage({
    super.key,
    required this.job,
  });

  final Job job;

  // Static benefits shown in the 4-column grid.
  static const List<_BenefitData> _benefits = [
    _BenefitData(icon: Icons.health_and_safety_outlined, title: 'Health\nInsurance'),
    _BenefitData(icon: Icons.savings_outlined, title: '401(k)\nMatching'),
    _BenefitData(icon: Icons.calendar_month_outlined, title: 'Flexible\nSchedule'),
    _BenefitData(icon: Icons.home_work_outlined, title: 'Remote\nOption'),
  ];

  String get _companyWordmark => job.recruiterName.toUpperCase();

  String get _companyInitials {
    final parts = job.recruiterName.trim().split(RegExp(r'\s+'));
    if (parts.isEmpty || parts.first.isEmpty) return '?';
    if (parts.length == 1) return parts.first.substring(0, 1).toUpperCase();
    return (parts.first.substring(0, 1) + parts.last.substring(0, 1)).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light.copyWith(
        statusBarColor: Colors.transparent,
      ),
      child: Scaffold(
        backgroundColor: _JobColors.background,
        extendBodyBehindAppBar: true,
        body: CustomScrollView(
          slivers: [
            // ------------------------------------------------------------
            // HERO HEADER
            // ------------------------------------------------------------
            SliverAppBar(
              expandedHeight: 260,
              pinned: true,
              elevation: 0,
              backgroundColor: _JobColors.ink,
              foregroundColor: Colors.white,
              automaticallyImplyLeading: false,
              leadingWidth: 0,
              titleSpacing: 0,
              flexibleSpace: FlexibleSpaceBar(
                background: Stack(
                  fit: StackFit.expand,
                  children: [
                    // Hero photograph: modern glass corporate architecture.
                    Image.network(
                      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                            colors: [Color(0xFF0F172A), Color(0xFF1E293B)],
                          ),
                        ),
                      ),
                    ),
                    // Darkening gradient so the wordmark & controls stay legible.
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.black.withValues(alpha: 0.35),
                            Colors.black.withValues(alpha: 0.15),
                            Colors.black.withValues(alpha: 0.45),
                          ],
                        ),
                      ),
                    ),
                    // Centered, letter-spaced corporate wordmark.
                    Align(
                      alignment: Alignment.center,
                      child: Padding(
                        padding: const EdgeInsets.only(bottom: 24),
                        child: Text(
                          _companyWordmark,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 4,
                          ),
                        ),
                      ),
                    ),
                    // Floating tactile action controls.
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _CircleIconButton(
                              icon: Icons.arrow_back,
                              onPressed: () => Navigator.pop(context),
                            ),
                            Row(
                              children: [
                                _CircleIconButton(
                                  icon: Icons.bookmark_border,
                                  onPressed: () {
                                    // Favorite functionality can be added later.
                                  },
                                ),
                                const SizedBox(width: 10),
                                _CircleIconButton(
                                  icon: Icons.more_vert,
                                  onPressed: () {
                                    // Overflow menu can be added later.
                                  },
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ------------------------------------------------------------
            // OVERLAPPING CONTENT SHEET
            // ------------------------------------------------------------
            SliverToBoxAdapter(
              child: Transform.translate(
                offset: const Offset(0, -24),
                child: Container(
                  decoration: BoxDecoration(
                    color: _JobColors.background,
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.06),
                        blurRadius: 20,
                        offset: const Offset(0, -4),
                      ),
                    ],
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 24, 20, 110),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // ----------------------------------------------
                        // COMPANY BADGE + JOB TITLE CARD
                        // ----------------------------------------------
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.06),
                                blurRadius: 15,
                                offset: const Offset(0, 5),
                              ),
                            ],
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  // 48x48 dark monogram logo.
                                  Container(
                                    width: 48,
                                    height: 48,
                                    decoration: BoxDecoration(
                                      color: _JobColors.ink,
                                      borderRadius: BorderRadius.circular(14),
                                      image: job.recruiterAvatarUrl != null &&
                                              job.recruiterAvatarUrl!.isNotEmpty
                                          ? DecorationImage(
                                              image: NetworkImage(job.recruiterAvatarUrl!),
                                              fit: BoxFit.cover,
                                            )
                                          : null,
                                    ),
                                    alignment: Alignment.center,
                                    child: job.recruiterAvatarUrl != null &&
                                            job.recruiterAvatarUrl!.isNotEmpty
                                        ? null
                                        : Text(
                                            _companyInitials,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 16,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Row(
                                      children: [
                                        Flexible(
                                          child: Text(
                                            job.recruiterName,
                                            overflow: TextOverflow.ellipsis,
                                            style: const TextStyle(
                                              fontSize: 16,
                                              fontWeight: FontWeight.w600,
                                              color: _JobColors.ink,
                                            ),
                                          ),
                                        ),
                                        const SizedBox(width: 5),
                                        const Icon(
                                          Icons.verified,
                                          size: 18,
                                          color: _JobColors.primary,
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 18),
                              Text(
                                job.title,
                                style: const TextStyle(
                                  fontSize: 24,
                                  fontWeight: FontWeight.bold,
                                  color: _JobColors.ink,
                                ),
                              ),
                              const SizedBox(height: 20),
                              _DetailRow(icon: Icons.location_on_outlined, text: job.location),
                              const SizedBox(height: 12),
                              _DetailRow(icon: Icons.access_time_outlined, text: job.jobType),
                              const SizedBox(height: 12),
                              _DetailRow(icon: Icons.attach_money, text: job.salaryRange),
                            ],
                          ),
                        ),

                        const SizedBox(height: 24),

                        // ----------------------------------------------
                        // BENEFITS GRID (4 columns)
                        // ----------------------------------------------
                        const Text(
                          'Benefits',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: _JobColors.ink,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            for (var i = 0; i < _benefits.length; i++) ...[
                              if (i != 0) const SizedBox(width: 8),
                              Expanded(
                                child: _BenefitCard(
                                  icon: _benefits[i].icon,
                                  title: _benefits[i].title,
                                ),
                              ),
                            ],
                          ],
                        ),

                        const SizedBox(height: 28),

                        // ----------------------------------------------
                        // JOB DESCRIPTION
                        // ----------------------------------------------
                        const Text(
                          'Job Description',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: _JobColors.ink,
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          job.description,
                          style: const TextStyle(
                            fontSize: 15,
                            height: 1.6,
                            color: _JobColors.subtext,
                          ),
                        ),

                        const SizedBox(height: 28),

                        // ----------------------------------------------
                        // AI MATCH SCORE
                        // ----------------------------------------------
                        Container(
                          padding: const EdgeInsets.all(18),
                          decoration: BoxDecoration(
                            color: _JobColors.matchCardBg,
                            borderRadius: BorderRadius.circular(18),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.auto_awesome,
                                size: 32,
                                color: _JobColors.primary,
                              ),
                              const SizedBox(width: 12),
                              const Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'AI Match Score',
                                      style: TextStyle(
                                        fontSize: 17,
                                        fontWeight: FontWeight.bold,
                                        color: _JobColors.ink,
                                      ),
                                    ),
                                    SizedBox(height: 4),
                                    Text(
                                      "You're a great fit for this role based on your skills and experience.",
                                      style: TextStyle(
                                        fontSize: 13,
                                        color: _JobColors.subtext,
                                        height: 1.4,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 12),
                              SizedBox(
                                width: 64,
                                height: 64,
                                child: Stack(
                                  alignment: Alignment.center,
                                  children: [
                                    const SizedBox(
                                      width: 64,
                                      height: 64,
                                      child: CircularProgressIndicator(
                                        value: 1,
                                        strokeWidth: 6,
                                        valueColor: AlwaysStoppedAnimation(Colors.white),
                                      ),
                                    ),
                                    SizedBox(
                                      width: 64,
                                      height: 64,
                                      child: CircularProgressIndicator(
                                        value: 0.92,
                                        strokeWidth: 6,
                                        strokeCap: StrokeCap.round,
                                        backgroundColor: Colors.transparent,
                                        valueColor: const AlwaysStoppedAnimation(
                                          _JobColors.primary,
                                        ),
                                      ),
                                    ),
                                    const Text(
                                      '92%',
                                      style: TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.bold,
                                        color: _JobColors.ink,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: 28),

                        // ----------------------------------------------
                        // KEY SKILLS
                        // ----------------------------------------------
                        const Text(
                          'Key Skills',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: _JobColors.ink,
                          ),
                        ),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: job.skills.map((skill) {
                            return Container(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                              decoration: BoxDecoration(
                                color: _JobColors.skillPillBg,
                                borderRadius: BorderRadius.circular(20),
                                border: Border.all(color: _JobColors.skillPillBorder),
                              ),
                              child: Text(
                                skill,
                                style: const TextStyle(
                                  color: _JobColors.ink,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),

        // ------------------------------------------------------------
        // STICKY BOTTOM APPLY BAR
        // ------------------------------------------------------------
        bottomNavigationBar: SafeArea(
          child: Container(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            decoration: const BoxDecoration(color: Colors.white),
            child: Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                   onPressed: () async {
  final authUser = context.read<AuthBloc>().state.user;

  if (authUser == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Please sign in to apply.'),
      ),
    );
    return;
  }

  if (job.formUrl == null || job.formUrl!.isEmpty) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('No application form available for this job.'),
      ),
    );
    return;
  }

  final uri = Uri.tryParse(job.formUrl!);

  if (uri == null || !await canLaunchUrl(uri)) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Could not open the application form.'),
        ),
      );
    }
    return;
  }

  // Open the recruiter's application form.
  await launchUrl(
    uri,
    mode: LaunchMode.externalApplication,
  );

  // Record the application in Firestore.
  if (context.mounted) {
    context.read<JobsBloc>().add(
      JobsApplyRequested(
        jobId: job.id,
        recruiterId: job.recruiterId,
        studentId: authUser.id,
        studentName: authUser.fullName,
      ),
    );
  }
},
                    icon: const Icon(Icons.send_outlined),
                    label: const Text(
                      'Apply Now',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                    style: FilledButton.styleFrom(
                      backgroundColor: _JobColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(30),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    shape: BoxShape.circle,
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: IconButton(
                    onPressed: () {
                      // Favorite functionality can be added later.
                    },
                    icon: const Icon(
                      Icons.favorite_border,
                      color: _JobColors.ink,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ================================================================
// FLOATING CIRCULAR ACTION BUTTON (44x44pt)
// ================================================================

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({
    required this.icon,
    required this.onPressed,
  });

  final IconData icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 44,
      height: 44,
      child: Material(
        color: Colors.white,
        shape: const CircleBorder(),
        child: IconButton(
          padding: EdgeInsets.zero,
          icon: Icon(icon, color: _JobColors.ink, size: 20),
          onPressed: onPressed,
        ),
      ),
    );
  }
}

// ================================================================
// DETAIL ROW
// ================================================================

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.icon,
    required this.text,
  });

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 21, color: _JobColors.primary),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(fontSize: 15, color: _JobColors.subtext),
          ),
        ),
      ],
    );
  }
}

// ================================================================
// BENEFIT CARD
// ================================================================

class _BenefitData {
  const _BenefitData({required this.icon, required this.title});

  final IconData icon;
  final String title;
}

class _BenefitCard extends StatelessWidget {
  const _BenefitCard({
    required this.icon,
    required this.title,
  });

  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 104,
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
      decoration: BoxDecoration(
        color: _JobColors.benefitBg,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: const BoxDecoration(
              color: _JobColors.benefitIconBg,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(
              icon,
              color: _JobColors.primary,
              size: 18,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: _JobColors.ink,
              height: 1.2,
            ),
          ),
        ],
      ),
    );
  }
}