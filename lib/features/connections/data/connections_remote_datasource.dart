import 'package:cloud_firestore/cloud_firestore.dart';

enum ConnectionStatus {
  none,
  outgoingPending,
  incomingPending,
  connected,
}

class ConnectionRequestModel {
  const ConnectionRequestModel({
    required this.otherUserId,
    required this.otherUserName,
    this.otherUserPhotoUrl,
  });

  final String otherUserId;
  final String otherUserName;
  final String? otherUserPhotoUrl;
}

abstract class ConnectionsRemoteDataSource {
  String pairIdFor(String uidA, String uidB);

  Stream<ConnectionStatus> watchStatus({
    required String myUid,
    required String otherUid,
  });

  Stream<List<String>> watchConnectedUserIds(String myUid);

  Stream<List<ConnectionRequestModel>> watchIncomingRequests(String myUid);

  Future<void> sendRequest({
    required String myUid,
    required String myName,
    required String otherUid,
    required String otherName,
    String? myPhotoUrl,
    String? otherPhotoUrl,
  });

  Future<void> acceptRequest({
    required String myUid,
    required String otherUid,
  });

  Future<bool> areConnected({
    required String myUid,
    required String otherUid,
  });
}

class ConnectionsRemoteDataSourceImpl implements ConnectionsRemoteDataSource {
  ConnectionsRemoteDataSourceImpl({required FirebaseFirestore firestore})
      : _firestore = firestore;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _connections =>
      _firestore.collection('connections');

  @override
  String pairIdFor(String uidA, String uidB) {
    final ids = [uidA, uidB]..sort();
    return '${ids[0]}_${ids[1]}';
  }

  @override
  Stream<ConnectionStatus> watchStatus({
    required String myUid,
    required String otherUid,
  }) {
    final pairId = pairIdFor(myUid, otherUid);
    return _connections.doc(pairId).snapshots().map((doc) {
      if (!doc.exists || doc.data() == null) return ConnectionStatus.none;
      final data = doc.data()!;
      final status = (data['status'] as String?) ?? 'none';
      final requesterId = (data['requesterId'] as String?) ?? '';
      if (status == 'accepted') return ConnectionStatus.connected;
      if (status == 'pending') {
        return requesterId == myUid
            ? ConnectionStatus.outgoingPending
            : ConnectionStatus.incomingPending;
      }
      return ConnectionStatus.none;
    });
  }

  @override
  Stream<List<String>> watchConnectedUserIds(String myUid) {
    return _connections
        .where('participantIds', arrayContains: myUid)
        .where('status', isEqualTo: 'accepted')
        .snapshots()
        .map(
          (snap) => snap.docs
              .map((doc) {
                final ids = (doc.data()['participantIds'] as List<dynamic>?)
                        ?.map((e) => e.toString())
                        .toList() ??
                    const <String>[];
                return ids.firstWhere((id) => id != myUid, orElse: () => '');
              })
              .where((id) => id.isNotEmpty)
              .toList(),
        );
  }

  @override
  Stream<List<ConnectionRequestModel>> watchIncomingRequests(String myUid) {
    return _connections
        .where('participantIds', arrayContains: myUid)
        .where('status', isEqualTo: 'pending')
        .snapshots()
        .map((snap) {
      return snap.docs
          .where((doc) => (doc.data()['requesterId'] as String?) != myUid)
          .map((doc) {
        final data = doc.data();
        final participantNames =
            Map<String, dynamic>.from(data['participantNames'] ?? {});
        final participantPhotos =
            Map<String, dynamic>.from(data['participantPhotos'] ?? {});
        final ids = (data['participantIds'] as List<dynamic>?)
                ?.map((e) => e.toString())
                .toList() ??
            const <String>[];
        final otherId = ids.firstWhere((id) => id != myUid, orElse: () => '');
        return ConnectionRequestModel(
          otherUserId: otherId,
          otherUserName: (participantNames[otherId] as String?) ?? 'User',
          otherUserPhotoUrl: participantPhotos[otherId] as String?,
        );
      }).toList();
    });
  }

  @override
  Future<void> sendRequest({
    required String myUid,
    required String myName,
    required String otherUid,
    required String otherName,
    String? myPhotoUrl,
    String? otherPhotoUrl,
  }) async {
    final docRef = _connections.doc(pairIdFor(myUid, otherUid));
    final existing = await docRef.get();
    final now = FieldValue.serverTimestamp();
    if (existing.exists) {
      final data = existing.data() ?? {};
      final status = (data['status'] as String?) ?? '';
      final requesterId = (data['requesterId'] as String?) ?? '';
      if (status == 'accepted') return;
      if (status == 'pending' && requesterId != myUid) {
        await docRef.update({
          'status': 'accepted',
          'updatedAt': now,
        });
        return;
      }
    }

    await docRef.set(
      {
        'participantIds': [myUid, otherUid],
        'participantNames': {
          myUid: myName,
          otherUid: otherName,
        },
        'participantPhotos': {
          myUid: myPhotoUrl,
          otherUid: otherPhotoUrl,
        },
        'requesterId': myUid,
        'status': 'pending',
        'createdAt': now,
        'updatedAt': now,
      },
      SetOptions(merge: true),
    );
  }

  @override
  Future<void> acceptRequest({
    required String myUid,
    required String otherUid,
  }) async {
    final docRef = _connections.doc(pairIdFor(myUid, otherUid));
    await docRef.set({
      'status': 'accepted',
      'updatedAt': FieldValue.serverTimestamp(),
    }, SetOptions(merge: true));
  }

  @override
  Future<bool> areConnected({
    required String myUid,
    required String otherUid,
  }) async {
    final doc = await _connections.doc(pairIdFor(myUid, otherUid)).get();
    if (!doc.exists || doc.data() == null) return false;
    return (doc.data()!['status'] as String?) == 'accepted';
  }
}
