import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/data/models/app_user_model.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../chat/data/chat_remote_datasource.dart';
import '../../../chat/presentation/pages/chat_detail_page.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final _queryCtrl = TextEditingController();
  final Set<String> _skillFilters = {};

  @override
  void dispose() {
    _queryCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final fs = sl<FirebaseFirestore>();

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: TextField(
            controller: _queryCtrl,
            decoration: InputDecoration(
              hintText: 'Search students by name…',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              suffixIcon: _queryCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        setState(() {
                          _queryCtrl.clear();
                        });
                      },
                    )
                  : null,
            ),
            onChanged: (_) => setState(() {}),
          ),
        ),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Align(
            alignment: Alignment.centerLeft,
            child: Text(
              'Filter by skill (tap chips from results to add)',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
        ),
        if (_skillFilters.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Wrap(
              spacing: 6,
              children: _skillFilters
                  .map(
                    (s) => InputChip(
                      label: Text(s),
                      onDeleted: () => setState(() => _skillFilters.remove(s)),
                    ),
                  )
                  .toList(),
            ),
          ),
        Expanded(
          child: StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
            stream: fs
                .collection('users')
                .where('role', isEqualTo: 'student')
                .limit(100)
                .snapshots(),
            builder: (context, snap) {
              if (snap.hasError) {
                return Center(child: Text('Error: ${snap.error}'));
              }
              if (!snap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }

              final me = context.read<AuthBloc>().state.user?.id;
              final q = _queryCtrl.text.trim().toLowerCase();
              final docs = snap.data!.docs
                  .map((d) => AppUserModel.fromFirestore(d.id, d.data()))
                  .where((u) => u.id != me)
                  .where((u) {
                    if (q.isEmpty) return true;
                    return u.fullName.toLowerCase().contains(q) ||
                        u.email.toLowerCase().contains(q);
                  })
                  .where((u) {
                    if (_skillFilters.isEmpty) return true;
                    final set = u.skills.map((e) => e.toLowerCase()).toSet();
                    return _skillFilters.every(
                      (f) => set.contains(f.toLowerCase()),
                    );
                  })
                  .toList();

              if (docs.isEmpty) {
                return const Center(child: Text('No students match your search'));
              }

              return ListView.builder(
                itemCount: docs.length,
                itemBuilder: (context, i) {
                  final u = docs[i];
                  return Card(
                    margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    child: ListTile(
                      leading: CircleAvatar(
                        backgroundImage:
                            u.photoUrl != null ? NetworkImage(u.photoUrl!) : null,
                        child: u.photoUrl == null
                            ? Text(
                                u.fullName.isNotEmpty
                                    ? u.fullName[0].toUpperCase()
                                    : '?',
                              )
                            : null,
                      ),
                      title: Text(u.fullName),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (u.skills.isNotEmpty)
                            Wrap(
                              spacing: 4,
                              children: u.skills.take(6).map((s) {
                                return ActionChip(
                                  label: Text(s, style: const TextStyle(fontSize: 11)),
                                  padding: EdgeInsets.zero,
                                  onPressed: () {
                                    setState(() => _skillFilters.add(s));
                                  },
                                );
                              }).toList(),
                            ),
                        ],
                      ),
                      trailing: FilledButton.tonal(
                        onPressed: () => _openChat(context, u),
                        child: const Text('Message'),
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }

  Future<void> _openChat(BuildContext context, AppUserModel other) async {
    final auth = context.read<AuthBloc>().state.user;
    if (auth == null) return;

    final chat = sl<ChatRemoteDataSource>();
    await chat.ensureThread(
      myUid: auth.id,
      otherUid: other.id,
      myName: auth.fullName,
      otherName: other.fullName,
    );
    final threadId = chat.threadIdFor(auth.id, other.id);
    if (!context.mounted) return;
    await Navigator.of(context).pushNamed(
      ChatDetailPage.routeName,
      arguments: ChatDetailArgs(
        threadId: threadId,
        otherUserId: other.id,
        otherUserName: other.fullName,
      ),
    );
  }
}
