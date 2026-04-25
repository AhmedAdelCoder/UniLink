import 'package:cloud_firestore/cloud_firestore.dart';

abstract class FollowsRemoteDataSource {
  Stream<List<String>> watchFollowedCompanyIds(String studentId);
  Stream<bool> watchIsFollowing({
    required String studentId,
    required String companyId,
  });
  Future<void> followCompany({
    required String studentId,
    required String companyId,
  });
  Future<void> unfollowCompany({
    required String studentId,
    required String companyId,
  });
}

class FollowsRemoteDataSourceImpl implements FollowsRemoteDataSource {
  FollowsRemoteDataSourceImpl({required FirebaseFirestore firestore})
      : _firestore = firestore;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _follows =>
      _firestore.collection('follows');

  String _followId({
    required String studentId,
    required String companyId,
  }) {
    return '${studentId}_$companyId';
  }

  @override
  Stream<List<String>> watchFollowedCompanyIds(String studentId) {
    return _follows
        .where('studentId', isEqualTo: studentId)
        .snapshots()
        .map((snapshot) {
      return snapshot.docs
          .map((doc) => (doc.data()['companyId'] as String?) ?? '')
          .where((companyId) => companyId.isNotEmpty)
          .toSet()
          .toList();
    });
  }

  @override
  Stream<bool> watchIsFollowing({
    required String studentId,
    required String companyId,
  }) {
    return _follows
        .doc(
          _followId(studentId: studentId, companyId: companyId),
        )
        .snapshots()
        .map((doc) => doc.exists);
  }

  @override
  Future<void> followCompany({
    required String studentId,
    required String companyId,
  }) async {
    await _follows
        .doc(
          _followId(studentId: studentId, companyId: companyId),
        )
        .set({
      'studentId': studentId,
      'companyId': companyId,
      'createdAt': FieldValue.serverTimestamp(),
    });
  }

  @override
  Future<void> unfollowCompany({
    required String studentId,
    required String companyId,
  }) async {
    await _follows
        .doc(
          _followId(studentId: studentId, companyId: companyId),
        )
        .delete();
  }
}
