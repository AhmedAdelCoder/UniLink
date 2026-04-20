import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/data/models/app_user_model.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../data/chat_remote_datasource.dart';
import '../../../connections/data/connections_remote_datasource.dart';
import 'chat_detail_page.dart';

class ChatListPage extends StatelessWidget {
  const ChatListPage({super.key});

  @override
  Widget build(BuildContext context) {
    final uid = context.watch<AuthBloc>().state.user?.id;
    if (uid == null) {
      return const Center(child: Text('Sign in to use chat'));
    }

    final chat = sl<ChatRemoteDataSource>();
    final connections = sl<ConnectionsRemoteDataSource>();
    final firestore = sl<FirebaseFirestore>();

    return StreamBuilder<List<String>>(
      stream: connections.watchConnectedUserIds(uid),
      builder: (context, snap) {
        if (snap.hasError) {
          return Center(child: Text('${snap.error}'));
        }
        if (!snap.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        final connectedIds = snap.data!;

        return StreamBuilder<List<ConnectionRequestModel>>(
          stream: connections.watchIncomingRequests(uid),
          builder: (context, requestSnap) {
            final requests = requestSnap.data ?? const <ConnectionRequestModel>[];
            return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
              stream: firestore.collection('users').snapshots(),
              builder: (context, usersSnap) {
                if (!usersSnap.hasData) {
                  return const Center(child: CircularProgressIndicator());
                }
                final users = usersSnap.data!.docs
                    .map((d) => AppUserModel.fromFirestore(d.id, d.data()))
                    .where((u) => connectedIds.contains(u.id))
                    .toList();

                if (users.isEmpty && requests.isEmpty) {
                  return const Center(
                    child: Text(
                      'No connections yet.\nConnect with people from Search first.',
                    ),
                  );
                }

                return ListView(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 16),
                  children: [
                    if (requests.isNotEmpty) ...[
                      Text(
                        'Connection Requests',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                      ...requests.map(
                        (request) => Card(
                          elevation: 0,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                            side: BorderSide(
                              color: Theme.of(context).colorScheme.outlineVariant,
                            ),
                          ),
                          child: ListTile(
                            leading: CircleAvatar(
                              backgroundImage: request.otherUserPhotoUrl != null
                                  ? NetworkImage(request.otherUserPhotoUrl!)
                                  : null,
                              child: request.otherUserPhotoUrl == null
                                  ? Text(
                                      request.otherUserName.isNotEmpty
                                          ? request.otherUserName[0].toUpperCase()
                                          : '?',
                                    )
                                  : null,
                            ),
                            title: Text(request.otherUserName),
                            subtitle: const Text('Wants to connect with you'),
                            trailing: FilledButton(
                              onPressed: () async {
                                await connections.acceptRequest(
                                  myUid: uid,
                                  otherUid: request.otherUserId,
                                );
                              },
                              child: const Text('Accept'),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        'Messages',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 8),
                    ],
                    ...users.map(
                      (u) => _ConnectedUserTile(
                        user: u,
                        myUid: uid,
                        chat: chat,
                      ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }
}

class _ConnectedUserTile extends StatelessWidget {
  const _ConnectedUserTile({
    required this.user,
    required this.myUid,
    required this.chat,
  });

  final AppUserModel user;
  final String myUid;
  final ChatRemoteDataSource chat;

  @override
  Widget build(BuildContext context) {
    final threadId = chat.threadIdFor(myUid, user.id);
    return StreamBuilder<List<ChatThreadModel>>(
      stream: chat.watchThreads(myUid),
      builder: (context, snap) {
        ChatThreadModel? thread;
        for (final item in (snap.data ?? const <ChatThreadModel>[])) {
          if (item.otherUserId == user.id) {
            thread = item;
            break;
          }
        }
        final subtitle = thread == null || thread.lastMessageText.isEmpty
            ? 'Start a conversation'
            : thread.lastMessageText;
        return Card(
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
          child: ListTile(
            leading: CircleAvatar(
              backgroundImage:
                  user.photoUrl != null ? NetworkImage(user.photoUrl!) : null,
              child: user.photoUrl == null
                  ? Text(user.fullName.isNotEmpty ? user.fullName[0] : '?')
                  : null,
            ),
            title: Text(user.fullName),
            subtitle: Text(
              subtitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            onTap: () async {
              try {
                await chat.ensureThread(
                  myUid: myUid,
                  otherUid: user.id,
                  myName: context.read<AuthBloc>().state.user?.fullName ?? 'Me',
                  otherName: user.fullName,
                );
                if (!context.mounted) return;
                Navigator.of(context).pushNamed(
                  ChatDetailPage.routeName,
                  arguments: ChatDetailArgs(
                    threadId: threadId,
                    otherUserId: user.id,
                    otherUserName: user.fullName,
                  ),
                );
              } catch (e) {
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(e.toString())),
                  );
                }
              }
            },
          ),
        );
      },
    );
  }
}
