import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart' as fb;

class ChatThreadModel {
  ChatThreadModel({
    required this.id,
    required this.participantIds,
    required this.participantNames,
    required this.lastMessageText,
    required this.lastMessageAt,
    required this.otherUserId,
    required this.otherUserName,
  });

  final String id;
  final List<String> participantIds;
  final Map<String, dynamic> participantNames;
  final String lastMessageText;
  final DateTime? lastMessageAt;
  final String otherUserId;
  final String otherUserName;

  factory ChatThreadModel.fromDoc(
    DocumentSnapshot<Map<String, dynamic>> doc,
    String myUid,
  ) {
    final data = doc.data() ?? {};
    final ids = (data['participantIds'] as List<dynamic>?)
            ?.map((e) => e.toString())
            .toList() ??
        const <String>[];
    final names = Map<String, dynamic>.from(
      data['participantNames'] as Map<dynamic, dynamic>? ?? {},
    );
    final otherId = ids.firstWhere((id) => id != myUid, orElse: () => '');
    final otherName = (names[otherId] as String?) ?? 'User';

    DateTime? at;
    final ts = data['lastMessageAt'];
    if (ts is Timestamp) at = ts.toDate();

    return ChatThreadModel(
      id: doc.id,
      participantIds: ids,
      participantNames: names,
      lastMessageText: (data['lastMessageText'] as String?) ?? '',
      lastMessageAt: at,
      otherUserId: otherId,
      otherUserName: otherName,
    );
  }
}

class ChatMessageModel {
  ChatMessageModel({
    required this.id,
    required this.text,
    required this.senderId,
    required this.createdAt,
  });

  final String id;
  final String text;
  final String senderId;
  final DateTime? createdAt;

  factory ChatMessageModel.fromDoc(DocumentSnapshot<Map<String, dynamic>> doc) {
    final data = doc.data() ?? {};
    DateTime? at;
    final ts = data['createdAt'];
    if (ts is Timestamp) at = ts.toDate();
    return ChatMessageModel(
      id: doc.id,
      text: (data['text'] as String?) ?? '',
      senderId: (data['senderId'] as String?) ?? '',
      createdAt: at,
    );
  }
}

abstract class ChatRemoteDataSource {
  String threadIdFor(String uidA, String uidB);

  Future<void> ensureThread({
    required String myUid,
    required String otherUid,
    required String myName,
    required String otherName,
  });

  Stream<List<ChatThreadModel>> watchThreads(String myUid);

  Stream<List<ChatMessageModel>> watchMessages(String threadId);

  Future<void> sendMessage({
    required String threadId,
    required String text,
  });
}

class ChatRemoteDataSourceImpl implements ChatRemoteDataSource {
  ChatRemoteDataSourceImpl({
    required FirebaseFirestore firestore,
    required fb.FirebaseAuth auth,
  })  : _firestore = firestore,
        _auth = auth;

  final FirebaseFirestore _firestore;
  final fb.FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _chats =>
      _firestore.collection('chats');

  @override
  String threadIdFor(String uidA, String uidB) {
    final sorted = [uidA, uidB]..sort();
    return '${sorted[0]}_${sorted[1]}';
  }

  @override
  Future<void> ensureThread({
    required String myUid,
    required String otherUid,
    required String myName,
    required String otherName,
  }) async {
    final id = threadIdFor(myUid, otherUid);
    await _chats.doc(id).set(
      {
        'participantIds': [myUid, otherUid],
        'participantNames': {
          myUid: myName,
          otherUid: otherName,
        },
        'lastMessageText': '',
        'lastMessageAt': FieldValue.serverTimestamp(),
        'lastSenderId': '',
      },
      SetOptions(merge: true),
    );
  }

  @override
  Stream<List<ChatThreadModel>> watchThreads(String myUid) {
    return _chats
        .where('participantIds', arrayContains: myUid)
        .snapshots()
        .map(
          (snap) {
            final list = snap.docs
                .map((d) => ChatThreadModel.fromDoc(d, myUid))
                .toList();
            list.sort((a, b) {
              final ta = a.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0);
              final tb = b.lastMessageAt ?? DateTime.fromMillisecondsSinceEpoch(0);
              return tb.compareTo(ta);
            });
            return list;
          },
        );
  }

  @override
  Stream<List<ChatMessageModel>> watchMessages(String threadId) {
    return _chats
        .doc(threadId)
        .collection('messages')
        .orderBy('createdAt', descending: false)
        .snapshots()
        .map(
          (snap) => snap.docs.map(ChatMessageModel.fromDoc).toList(),
        );
  }

  @override
  Future<void> sendMessage({
    required String threadId,
    required String text,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw StateError('Not logged in');
    }
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    final msgRef =
        _chats.doc(threadId).collection('messages').doc();
    await _firestore.runTransaction((tx) async {
      tx.set(msgRef, {
        'text': trimmed,
        'senderId': user.uid,
        'createdAt': FieldValue.serverTimestamp(),
        'read': false,
      });
      tx.update(_chats.doc(threadId), {
        'lastMessageText': trimmed,
        'lastMessageAt': FieldValue.serverTimestamp(),
        'lastSenderId': user.uid,
      });
    });
  }
}
