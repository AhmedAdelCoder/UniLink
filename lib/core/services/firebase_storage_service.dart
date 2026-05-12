import 'dart:io';
import 'package:firebase_storage/firebase_storage.dart';

class FirebaseStorageService {
  final FirebaseStorage _storage = FirebaseStorage.instance;

  Future<String> uploadCv(String uid, File file) async {
    final ref = _storage.ref().child('cvs/$uid/resume.pdf');

    final uploadTask = await ref.putFile(
      file,
      SettableMetadata(contentType: 'application/pdf'),
    );

    return await uploadTask.ref.getDownloadURL();
  }
}