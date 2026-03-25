import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:image_picker/image_picker.dart';

import '../../../../core/config/injection_container.dart';
import '../../../auth/presentation/bloc/auth_bloc.dart';
import '../../domain/entities/comment.dart';
import '../../domain/entities/post.dart';
import '../../domain/repositories/post_repository.dart';
import '../bloc/feed_bloc.dart';

class FeedPage extends StatefulWidget {
  const FeedPage({super.key});

  @override
  State<FeedPage> createState() => _FeedPageState();
}

class _FeedPageState extends State<FeedPage> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    context.read<FeedBloc>().add(const FeedLoadInitial());
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    const threshold = 200.0;
    if (_scrollController.position.extentAfter < threshold) {
      context.read<FeedBloc>().add(const FeedLoadMore());
    }
  }

  Future<void> _onRefresh() async {
    context.read<FeedBloc>().add(const FeedRefresh());
  }

  void _showCreatePostSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return _CreatePostSheet(
          onPosted: () => Navigator.of(sheetContext).pop(),
        );
      },
    );
  }

  void _showComments(Post post) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => _PostCommentsSheet(postId: post.id),
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentUserId = context.watch<AuthBloc>().state.user?.id;

    return BlocConsumer<FeedBloc, FeedState>(
      listener: (context, state) {
        if (state.errorMessage != null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(state.errorMessage!)),
          );
        }
      },
      builder: (context, state) {
        if (state.isLoadingInitial && state.posts.isEmpty) {
          return const Center(child: CircularProgressIndicator());
        }

        return Stack(
          children: [
            RefreshIndicator(
              onRefresh: _onRefresh,
              child: ListView.builder(
                controller: _scrollController,
                padding: const EdgeInsets.only(bottom: 88),
                itemCount:
                    state.posts.length + (state.isLoadingMore ? 1 : 0),
                itemBuilder: (context, index) {
                  if (index >= state.posts.length) {
                    return const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    );
                  }

                  final post = state.posts[index];
                  return _PostCard(
                    post: post,
                    currentUserId: currentUserId,
                    onLike: () {
                      context.read<FeedBloc>().add(FeedToggleLike(post.id));
                    },
                    onComment: () => _showComments(post),
                    onDelete: () {
                      context
                          .read<FeedBloc>()
                          .add(FeedDeletePost(post.id));
                    },
                  );
                },
              ),
            ),
            Positioned(
              right: 16,
              bottom: 16,
              child: FloatingActionButton.extended(
                onPressed: _showCreatePostSheet,
                icon: const Icon(Icons.edit),
                label: const Text('Post'),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _CreatePostSheet extends StatefulWidget {
  const _CreatePostSheet({required this.onPosted});

  final VoidCallback onPosted;

  @override
  State<_CreatePostSheet> createState() => _CreatePostSheetState();
}

class _CreatePostSheetState extends State<_CreatePostSheet> {
  final _textController = TextEditingController();
  String? _imagePath;

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _pickImage() async {
    final x = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1600,
      imageQuality: 85,
    );
    if (x != null) setState(() => _imagePath = x.path);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: BlocBuilder<FeedBloc, FeedState>(
        builder: (context, state) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: Colors.grey.shade400,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              TextField(
                controller: _textController,
                maxLines: 5,
                minLines: 3,
                decoration: const InputDecoration(
                  hintText: "Share what's on your mind...",
                  border: OutlineInputBorder(),
                ),
              ),
              const SizedBox(height: 8),
              if (_imagePath != null)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    onPressed: () => setState(() => _imagePath = null),
                    icon: const Icon(Icons.close),
                    label: const Text('Remove image'),
                  ),
                ),
              Row(
                children: [
                  TextButton.icon(
                    onPressed: state.isCreatingPost ? null : _pickImage,
                    icon: const Icon(Icons.image_outlined),
                    label: const Text('Photo'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: state.isCreatingPost
                        ? null
                        : () {
                            final text = _textController.text.trim();
                            if (text.isEmpty && _imagePath == null) return;
                            context.read<FeedBloc>().add(
                                  FeedCreatePost(
                                    text: text,
                                    imageFilePath: _imagePath,
                                  ),
                                );
                            widget.onPosted();
                          },
                    child: state.isCreatingPost
                        ? const SizedBox(
                            height: 18,
                            width: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor:
                                  AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text('Post'),
                  ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PostCommentsSheet extends StatefulWidget {
  const _PostCommentsSheet({required this.postId});

  final String postId;

  @override
  State<_PostCommentsSheet> createState() => _PostCommentsSheetState();
}

class _PostCommentsSheetState extends State<_PostCommentsSheet> {
  final _textCtrl = TextEditingController();
  Future<List<Comment>>? _future;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _textCtrl.dispose();
    super.dispose();
  }

  void _reload() {
    setState(() {
      _future = sl<PostRepository>().getComments(postId: widget.postId).then(
            (either) => either.fold(
              (l) => throw Exception(l.message),
              (c) => c,
            ),
          );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: MediaQuery.of(context).viewInsets.bottom + 16,
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.55,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Comments', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            Expanded(
              child: FutureBuilder<List<Comment>>(
                future: _future,
                builder: (context, snap) {
                  if (snap.hasError) {
                    return Center(child: Text('${snap.error}'));
                  }
                  if (!snap.hasData) {
                    return const Center(child: CircularProgressIndicator());
                  }
                  final list = snap.data!;
                  if (list.isEmpty) {
                    return const Center(child: Text('No comments yet'));
                  }
                  return ListView.builder(
                    itemCount: list.length,
                    itemBuilder: (context, i) {
                      final c = list[i];
                      return ListTile(
                        dense: true,
                        title: Text(c.userName,
                            style:
                                const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text(c.text),
                      );
                    },
                  );
                },
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _textCtrl,
                    decoration: const InputDecoration(
                      hintText: 'Write a comment…',
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                IconButton.filled(
                  onPressed: () {
                    final t = _textCtrl.text.trim();
                    if (t.isEmpty) return;
                    _textCtrl.clear();
                    context.read<FeedBloc>().add(
                          FeedAddComment(postId: widget.postId, text: t),
                        );
                    Future.delayed(const Duration(milliseconds: 400), _reload);
                  },
                  icon: const Icon(Icons.send),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PostCard extends StatelessWidget {
  const _PostCard({
    required this.post,
    required this.currentUserId,
    required this.onLike,
    required this.onComment,
    required this.onDelete,
  });

  final Post post;
  final String? currentUserId;
  final VoidCallback onLike;
  final VoidCallback onComment;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final isMine = currentUserId != null && post.authorId == currentUserId;

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundImage: post.authorPhotoUrl != null
                      ? CachedNetworkImageProvider(post.authorPhotoUrl!)
                      : null,
                  child: post.authorPhotoUrl == null
                      ? Text(
                          post.authorName.isNotEmpty
                              ? post.authorName[0].toUpperCase()
                              : '?',
                        )
                      : null,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        post.authorName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        _formatDate(post.createdAt),
                        style: Theme.of(context)
                            .textTheme
                            .bodySmall
                            ?.copyWith(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                if (isMine)
                  IconButton(
                    icon: const Icon(Icons.delete_outline),
                    onPressed: () async {
                      final ok = await showDialog<bool>(
                        context: context,
                        builder: (ctx) => AlertDialog(
                          title: const Text('Delete post?'),
                          content: const Text(
                            'This cannot be undone.',
                          ),
                          actions: [
                            TextButton(
                              onPressed: () => Navigator.pop(ctx, false),
                              child: const Text('Cancel'),
                            ),
                            FilledButton(
                              onPressed: () => Navigator.pop(ctx, true),
                              child: const Text('Delete'),
                            ),
                          ],
                        ),
                      );
                      if (ok == true) onDelete();
                    },
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (post.text.trim().isNotEmpty) Text(post.text.trim()),
            if (post.imageUrl != null) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: CachedNetworkImage(
                    imageUrl: post.imageUrl!,
                    fit: BoxFit.cover,
                    placeholder: (context, _) =>
                        const Center(child: CircularProgressIndicator()),
                    errorWidget: (context, error, stackTrace) =>
                        const Icon(Icons.broken_image),
                  ),
                ),
              ),
            ],
            if (post.skillsTags.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: -8,
                children: post.skillsTags
                    .map(
                      (skill) => Chip(
                        label: Text(skill),
                        visualDensity: VisualDensity.compact,
                      ),
                    )
                    .toList(),
              ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                IconButton(
                  onPressed: onLike,
                  icon: Icon(
                    post.isLikedByMe
                        ? Icons.favorite
                        : Icons.favorite_border,
                    color: post.isLikedByMe ? Colors.red : null,
                  ),
                ),
                Text('${post.likeCount}'),
                const SizedBox(width: 8),
                IconButton(
                  onPressed: onComment,
                  icon: const Icon(Icons.comment_outlined),
                ),
                Text('${post.commentCount}'),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);
    if (difference.inMinutes < 1) return 'Just now';
    if (difference.inMinutes < 60) return '${difference.inMinutes}m ago';
    if (difference.inHours < 24) return '${difference.inHours}h ago';
    return '${date.day}/${date.month}/${date.year}';
  }
}
