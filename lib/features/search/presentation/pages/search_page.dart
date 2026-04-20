import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/data/models/app_user_model.dart';
import '../../../auth/domain/entities/app_user.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../../connections/data/connections_remote_datasource.dart';
import '../../../profile/presentation/pages/profile_page.dart';

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
    final connections = sl<ConnectionsRemoteDataSource>();
    final auth = context.watch<AuthBloc>().state.user;
    final myId = auth?.id;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
          child: TextField(
            controller: _queryCtrl,
            decoration: InputDecoration(
              hintText: 'Search users by name...',
              prefixIcon: const Icon(Icons.search),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              suffixIcon: _queryCtrl.text.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        setState(_queryCtrl.clear);
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
            stream: fs.collection('users').limit(100).snapshots(),
            builder: (context, snap) {
              if (snap.hasError) {
                return Center(child: Text('Error: ${snap.error}'));
              }
              if (!snap.hasData) {
                return const Center(child: CircularProgressIndicator());
              }

              final q = _queryCtrl.text.trim().toLowerCase();
              final docs = snap.data!.docs
                  .map((d) => AppUserModel.fromFirestore(d.id, d.data()))
                  .where((u) => u.id != myId)
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
                return const Center(child: Text('No users match your search'));
              }

              return ListView.builder(
                itemCount: docs.length,
                itemBuilder: (context, i) {
                  final user = docs[i];
                  return Card(
                    margin:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(
                        color: Theme.of(context).colorScheme.outlineVariant,
                      ),
                    ),
                    child: ListTile(
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ProfilePage(userId: user.id),
                          ),
                        );
                      },
                      leading: CircleAvatar(
                        backgroundImage: user.photoUrl != null
                            ? NetworkImage(user.photoUrl!)
                            : null,
                        child: user.photoUrl == null
                            ? Text(
                                user.fullName.isNotEmpty
                                    ? user.fullName[0].toUpperCase()
                                    : '?',
                              )
                            : null,
                      ),
                      title: Text(user.fullName),
                      subtitle: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (user.bio.trim().isNotEmpty)
                            Text(
                              user.bio,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                            ),
                          if (user.skills.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 6),
                              child: Wrap(
                                spacing: 4,
                                children: user.skills.take(4).map((s) {
                                  return ActionChip(
                                    label: Text(
                                      s,
                                      style: const TextStyle(fontSize: 11),
                                    ),
                                    padding: EdgeInsets.zero,
                                    onPressed: () {
                                      setState(() => _skillFilters.add(s));
                                    },
                                  );
                                }).toList(),
                              ),
                            ),
                        ],
                      ),
                      trailing: myId == null || auth == null
                          ? null
                          : _ConnectionActionButton(
                              myUser: auth,
                              otherUser: user,
                              connections: connections,
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
}

class _ConnectionActionButton extends StatelessWidget {
  const _ConnectionActionButton({
    required this.myUser,
    required this.otherUser,
    required this.connections,
  });

  final AppUser myUser;
  final AppUserModel otherUser;
  final ConnectionsRemoteDataSource connections;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<ConnectionStatus>(
      stream: connections.watchStatus(
        myUid: myUser.id,
        otherUid: otherUser.id,
      ),
      builder: (context, snap) {
        final status = snap.data ?? ConnectionStatus.none;
        switch (status) {
          case ConnectionStatus.connected:
            return const Chip(label: Text('Connected'));
          case ConnectionStatus.outgoingPending:
            return const Chip(label: Text('Pending'));
          case ConnectionStatus.incomingPending:
            return FilledButton(
              onPressed: () async {
                await connections.acceptRequest(
                  myUid: myUser.id,
                  otherUid: otherUser.id,
                );
              },
              child: const Text('Accept'),
            );
          case ConnectionStatus.none:
            return FilledButton.tonal(
              onPressed: () async {
                await connections.sendRequest(
                  myUid: myUser.id,
                  myName: myUser.fullName,
                  myPhotoUrl: myUser.photoUrl,
                  otherUid: otherUser.id,
                  otherName: otherUser.fullName,
                  otherPhotoUrl: otherUser.photoUrl,
                );
              },
              child: const Text('Connect'),
            );
        }
      },
    );
  }
}
