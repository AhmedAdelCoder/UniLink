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

  void _showCreatePostSheet({bool openImagePicker = false}) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) {
        return _CreatePostSheet(
          openImagePickerOnStart: openImagePicker,
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
    final authUser = context.watch<AuthBloc>().state.user;

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

        return RefreshIndicator(
          onRefresh: _onRefresh,
          child: ListView.builder(
            controller: _scrollController,
            padding: const EdgeInsets.fromLTRB(12, 14, 12, 24),
            itemCount: state.posts.length + (state.isLoadingMore ? 1 : 0) + 1,
            itemBuilder: (context, index) {
              if (index == 0) {
                return _FeedComposerCard(
                  userName: authUser?.fullName ?? 'You',
                  userPhotoUrl: authUser?.photoUrl,
                  onTapComposer: () => _showCreatePostSheet(),
                  onTapPhoto: () => _showCreatePostSheet(openImagePicker: true),
                  onTapArticle: () => _showCreatePostSheet(),
                );
              }
              final adjustedIndex = index - 1;
              if (adjustedIndex >= state.posts.length) {
                return const Padding(
                  padding: EdgeInsets.symmetric(vertical: 16),
                  child: Center(
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                );
              }

              final post = state.posts[adjustedIndex];
              return _PostCard(
                post: post,
                currentUserId: currentUserId,
                onLike: () {
                  context.read<FeedBloc>().add(FeedToggleLike(post.id));
                },
                onComment: () => _showComments(post),
                onDelete: () {
                  context.read<FeedBloc>().add(FeedDeletePost(post.id));
                },
              );
            },
          ),
        );
      },
    );
  }
}

class _FeedComposerCard extends StatelessWidget {
  const _FeedComposerCard({
    required this.userName,
    required this.userPhotoUrl,
    required this.onTapComposer,
    required this.onTapPhoto,
    required this.onTapArticle,
  });

  final String userName;
  final String? userPhotoUrl;
  final VoidCallback onTapComposer;
  final VoidCallback onTapPhoto;
  final VoidCallback onTapArticle;

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundImage: userPhotoUrl != null
                      ? CachedNetworkImageProvider(userPhotoUrl!)
                      : null,
                  child: userPhotoUrl == null
                      ? Text(
                          userName.isNotEmpty ? userName[0].toUpperCase() : '?',
                        )
                      : null,
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(22),
                    onTap: onTapComposer,
                    child: Ink(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                          color: Theme.of(context).colorScheme.outlineVariant,
                        ),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      child: Text(
                        'Start a post...',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: Theme.of(
                                context,
                              ).colorScheme.onSurfaceVariant,
                            ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
Wrap(
  spacing: 8,
  children: [
    TextButton.icon(
      onPressed: onTapPhoto,
      icon: const Icon(Icons.image_outlined, size: 18),
      label: const Text('Photo'),
    ),
    TextButton.icon(
      onPressed: onTapArticle,
      icon: const Icon(Icons.edit_note_outlined, size: 18),
      label: const Text('Write article'),
    ),
  ],
)
          ],
        ),
      ),
    );
  }
}

class _CreatePostSheet extends StatefulWidget {
  const _CreatePostSheet({
    required this.onPosted,
    this.openImagePickerOnStart = false,
  });

  final VoidCallback onPosted;
  final bool openImagePickerOnStart;

  @override
  State<_CreatePostSheet> createState() => _CreatePostSheetState();
}

class _CreatePostSheetState extends State<_CreatePostSheet> {
  final _textController = TextEditingController();
  String? _imagePath;
  @override
  void initState() {
    super.initState();
    if (widget.openImagePickerOnStart) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _pickImage());
    }
  }


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
          return SingleChildScrollView(
            child: Column(
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
                Text(
                  'Create post',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _textController,
                  maxLines: 6,
                  minLines: 4,
                  decoration: InputDecoration(
                    hintText: "What's on your mind?",
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(14),
                      borderSide: BorderSide(
                        width: 1.4,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
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
                    const SizedBox(width: 8),
                    TextButton.icon(
                      onPressed: state.isCreatingPost ? null : () {},
                      icon: const Icon(Icons.edit_note_outlined),
                      label: const Text('Write article'),
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
            ),
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
    final scheme = Theme.of(context).colorScheme;

    return Card(
      elevation: 0,
      margin: const EdgeInsets.symmetric(horizontal: 2, vertical: 6),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: scheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
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
            const SizedBox(height: 10),
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
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 4),
            Row(
              children: [
                Expanded(
                  child: TextButton.icon(
                    onPressed: onLike,
                    icon: Icon(
                      post.isLikedByMe
                          ? Icons.favorite
                          : Icons.favorite_outline,
                      color: post.isLikedByMe ? Colors.redAccent : null,
                    ),
                    label: Text('Like ${post.likeCount}'),
                  ),
                ),
                Expanded(
                  child: TextButton.icon(
                    onPressed: onComment,
                    icon: Icon(
                      Icons.mode_comment_outlined,
                      color: post.commentCount > 0 ? scheme.primary : null,
                    ),
                    label: Text('Comment ${post.commentCount}'),
                  ),
                ),
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
