import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/post.dart';
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
    final threshold = 200.0;
    if (_scrollController.position.extentAfter < threshold) {
      context.read<FeedBloc>().add(const FeedLoadMore());
    }
  }

  Future<void> _onRefresh() async {
    context.read<FeedBloc>().add(const FeedRefresh());
  }

  void _showCreatePostSheet() {
    final textController = TextEditingController();
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) {
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
                    controller: textController,
                    maxLines: 5,
                    minLines: 3,
                    decoration: const InputDecoration(
                      hintText: "Share what's on your mind...",
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Align(
                    alignment: Alignment.centerRight,
                    child: FilledButton(
                      onPressed: state.isCreatingPost
                          ? null
                          : () {
                              final text = textController.text.trim();
                              if (text.isEmpty) return;
                              context.read<FeedBloc>().add(
                                    FeedCreatePost(text: text),
                                  );
                              Navigator.of(context).pop();
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
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
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
                padding: const EdgeInsets.only(bottom: 80),
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
                    onLike: () {
                      context.read<FeedBloc>().add(FeedToggleLike(post.id));
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

class _PostCard extends StatelessWidget {
  final Post post;
  final VoidCallback onLike;

  const _PostCard({
    required this.post,
    required this.onLike,
  });

  @override
  Widget build(BuildContext context) {
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
                      ? NetworkImage(post.authorPhotoUrl!)
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
              ],
            ),
            const SizedBox(height: 8),
            Text(post.text),
            if (post.imageUrl != null) ...[
              const SizedBox(height: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.network(
                    post.imageUrl!,
                    fit: BoxFit.cover,
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
                const SizedBox(width: 16),
                const Icon(Icons.comment_outlined, size: 20),
                const SizedBox(width: 4),
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

