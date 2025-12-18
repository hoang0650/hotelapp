import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { BlogService } from '../../services/blog.service';
import { CommentService, Comment } from '../../services/comment.service';
import { AuthService } from '../../services/auth.service';
import { Blog } from '../blog-management/blog-management.component';
import { NzMessageService } from 'ng-zorro-antd/message';

@Component({
  selector: 'app-blog',
  templateUrl: './blog.component.html',
  styleUrls: ['./blog.component.css']
})
export class BlogComponent implements OnInit {
  blogs: Blog[] = [];
  selectedBlog: Blog | null = null;
  relatedBlogs: Blog[] = [];
  isLoading = false;
  pageIndex = 1;
  pageSize = 9;
  total = 0;
  searchValue = '';
  categoryFilter: string = '';
  categories: string[] = [];

  // Comment section
  comments: Comment[] = [];
  isLoadingComments = false;
  commentForm: FormGroup;
  replyForms: Map<string, FormGroup> = new Map();
  showReplyForm: Map<string, boolean> = new Map();
  isSubmittingComment = false;

  // Like/Dislike
  isLikingBlog = false;
  isDislikingBlog = false;

  get isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  get currentUser(): any {
    return this.authService.getCurrentUser();
  }

  constructor(
    private blogService: BlogService,
    private commentService: CommentService,
    private authService: AuthService,
    private route: ActivatedRoute,
    public router: Router,
    private fb: FormBuilder,
    private message: NzMessageService
  ) {
    this.commentForm = this.fb.group({
      content: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  ngOnInit(): void {
    // Kiểm tra xem có blogId trong route không (xem chi tiết)
    this.route.params.subscribe(params => {
      const blogId = params['id'];
      if (blogId) {
        this.loadBlogDetail(blogId);
      } else {
        this.loadBlogs();
      }
    });
  }

  loadBlogs(): void {
    this.isLoading = true;
    const query: any = {
      page: this.pageIndex,
      limit: this.pageSize,
      status: 'published' // Chỉ lấy bài viết đã publish
    };

    if (this.searchValue) {
      query.search = this.searchValue;
    }

    if (this.categoryFilter) {
      query.category = this.categoryFilter;
    }

    this.blogService.getPublicBlogs(query).subscribe({
      next: (response: any) => {
        this.blogs = response.blogs || response.data || [];
        this.total = response.total || 0;
        
        // Lấy danh sách categories từ blogs
        const categorySet = new Set<string>();
        this.blogs.forEach(blog => {
          if (blog.category) {
            categorySet.add(blog.category);
          }
        });
        this.categories = Array.from(categorySet);
        
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách blog:', error);
        this.isLoading = false;
      }
    });
  }

  loadBlogDetail(id: string): void {
    this.isLoading = true;
    this.blogService.getPublicBlogById(id).subscribe({
      next: (blog) => {
        this.selectedBlog = blog;
        // Tăng lượt xem
        this.blogService.incrementViews(id).subscribe();
        this.isLoading = false;
        // Load comments
        this.loadComments(id);
        // Check user like/dislike status
        this.checkUserLikeStatus(blog);
        // Load related blogs
        this.loadRelatedBlogs(blog);
      },
      error: (error) => {
        console.error('Lỗi khi tải chi tiết blog:', error);
        this.router.navigate(['/blog']);
        this.isLoading = false;
      }
    });
  }

  loadRelatedBlogs(currentBlog: Blog): void {
    const query: any = {
      page: 1,
      limit: 20, // Lấy nhiều hơn để filter
      status: 'published'
    };

    if (currentBlog.category) {
      query.category = currentBlog.category;
    }

    this.blogService.getPublicBlogs(query).subscribe({
      next: (response: any) => {
        const allBlogs = response.blogs || response.data || [];
        // Filter loại bỏ blog hiện tại và chỉ lấy 5 bài đầu tiên
        this.relatedBlogs = allBlogs
          .filter((blog: Blog) => blog._id !== currentBlog._id)
          .slice(0, 5);
      },
      error: (error) => {
        console.error('Lỗi khi tải bài viết liên quan:', error);
        this.relatedBlogs = [];
      }
    });
  }

  getCurrentDateTime(): string {
    const now = new Date();
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayName = days[now.getDay()];
    const date = now.toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const time = now.toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit'
    });
    return `${dayName}, ngày ${date} ${time} (GMT+7)`;
  }

  loadComments(blogId: string): void {
    this.isLoadingComments = true;
    this.commentService.getComments(blogId).subscribe({
      next: (response) => {
        this.comments = response.comments || [];
        // Initialize reply forms
        this.comments.forEach(comment => {
          if (comment._id) {
            this.replyForms.set(comment._id, this.fb.group({
              content: ['', [Validators.required, Validators.minLength(1)]]
            }));
            this.showReplyForm.set(comment._id, false);
            // Initialize for replies too
            if (comment.replies) {
              comment.replies.forEach(reply => {
                if (reply._id) {
                  this.replyForms.set(reply._id, this.fb.group({
                    content: ['', [Validators.required, Validators.minLength(1)]]
                  }));
                  this.showReplyForm.set(reply._id, false);
                }
              });
            }
          }
        });
        this.isLoadingComments = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải comments:', error);
        this.isLoadingComments = false;
      }
    });
  }

  checkUserLikeStatus(blog: Blog): void {
    if (!this.isLoggedIn || !blog._id) return;
    // Status sẽ được check từ backend response
  }

  submitComment(parentCommentId?: string): void {
    if (!this.selectedBlog?._id) return;

    if (!this.isLoggedIn) {
      this.message.warning('Vui lòng đăng nhập để bình luận');
      this.router.navigate(['/login']);
      return;
    }

    const form = parentCommentId ? this.replyForms.get(parentCommentId) : this.commentForm;
    if (!form || form.invalid) {
      this.message.warning('Vui lòng nhập nội dung bình luận');
      return;
    }

    this.isSubmittingComment = true;
    const content = form.value.content;

    this.commentService.createComment(this.selectedBlog._id, content, parentCommentId).subscribe({
      next: (newComment) => {
        this.message.success(parentCommentId ? 'Đã trả lời bình luận' : 'Đã thêm bình luận');
        form.reset();
        if (parentCommentId) {
          this.showReplyForm.set(parentCommentId, false);
        }
        this.loadComments(this.selectedBlog!._id!);
        this.isSubmittingComment = false;
      },
      error: (error) => {
        console.error('Lỗi khi tạo comment:', error);
        this.message.error(error.error?.message || 'Không thể thêm bình luận');
        this.isSubmittingComment = false;
      }
    });
  }

  toggleReplyForm(commentId: string): void {
    if (!this.isLoggedIn) {
      this.message.warning('Vui lòng đăng nhập để trả lời');
      this.router.navigate(['/login']);
      return;
    }
    const current = this.showReplyForm.get(commentId) || false;
    this.showReplyForm.set(commentId, !current);
  }

  likeComment(commentId: string): void {
    if (!this.isLoggedIn) {
      this.message.warning('Vui lòng đăng nhập để thích bình luận');
      this.router.navigate(['/login']);
      return;
    }

    this.commentService.likeComment(commentId).subscribe({
      next: (response) => {
        this.loadComments(this.selectedBlog!._id!);
      },
      error: (error) => {
        console.error('Lỗi khi like comment:', error);
        this.message.error(error.error?.message || 'Không thể thích bình luận');
      }
    });
  }

  dislikeComment(commentId: string): void {
    if (!this.isLoggedIn) {
      this.message.warning('Vui lòng đăng nhập để không thích bình luận');
      this.router.navigate(['/login']);
      return;
    }

    this.commentService.dislikeComment(commentId).subscribe({
      next: (response) => {
        this.loadComments(this.selectedBlog!._id!);
      },
      error: (error) => {
        console.error('Lỗi khi dislike comment:', error);
        this.message.error(error.error?.message || 'Không thể không thích bình luận');
      }
    });
  }

  likeBlog(): void {
    if (!this.selectedBlog?._id) return;

    if (!this.isLoggedIn) {
      this.message.warning('Vui lòng đăng nhập để thích bài viết');
      this.router.navigate(['/login']);
      return;
    }

    this.isLikingBlog = true;
    this.blogService.likeBlog(this.selectedBlog._id).subscribe({
      next: (response) => {
        if (this.selectedBlog) {
          this.selectedBlog.likesCount = response.likesCount || 0;
          this.selectedBlog.dislikesCount = response.dislikesCount || 0;
          this.selectedBlog.userLiked = response.userLiked || false;
          this.selectedBlog.userDisliked = false;
        }
        this.isLikingBlog = false;
      },
      error: (error) => {
        console.error('Lỗi khi like blog:', error);
        this.message.error(error.error?.message || 'Không thể thích bài viết');
        this.isLikingBlog = false;
      }
    });
  }

  dislikeBlog(): void {
    if (!this.selectedBlog?._id) return;

    if (!this.isLoggedIn) {
      this.message.warning('Vui lòng đăng nhập để không thích bài viết');
      this.router.navigate(['/login']);
      return;
    }

    this.isDislikingBlog = true;
    this.blogService.dislikeBlog(this.selectedBlog._id).subscribe({
      next: (response) => {
        if (this.selectedBlog) {
          this.selectedBlog.likesCount = response.likesCount || 0;
          this.selectedBlog.dislikesCount = response.dislikesCount || 0;
          this.selectedBlog.userLiked = false;
          this.selectedBlog.userDisliked = response.userDisliked || false;
        }
        this.isDislikingBlog = false;
      },
      error: (error) => {
        console.error('Lỗi khi dislike blog:', error);
        this.message.error(error.error?.message || 'Không thể không thích bài viết');
        this.isDislikingBlog = false;
      }
    });
  }

  deleteComment(commentId: string): void {
    this.commentService.deleteComment(commentId).subscribe({
      next: () => {
        this.message.success('Đã xóa bình luận');
        if (this.selectedBlog?._id) {
          this.loadComments(this.selectedBlog._id);
        }
      },
      error: (error) => {
        console.error('Lỗi khi xóa comment:', error);
        this.message.error(error.error?.message || 'Không thể xóa bình luận');
      }
    });
  }

  canDeleteComment(comment: Comment): boolean {
    if (!this.isLoggedIn || !comment.userId) return false;
    return comment.userId === this.currentUser?._id || this.authService.isSuperAdmin();
  }

  formatCommentDate(date: Date | string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  viewBlogDetail(blog: Blog): void {
    if (blog._id) {
      this.router.navigate(['/blog', blog._id]);
    }
  }

  backToList(): void {
    this.selectedBlog = null;
    this.router.navigate(['/blog']);
    this.loadBlogs();
  }

  onSearch(): void {
    this.pageIndex = 1;
    this.loadBlogs();
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    this.loadBlogs();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onCategoryFilter(category: string): void {
    this.categoryFilter = this.categoryFilter === category ? '' : category;
    this.pageIndex = 1;
    this.loadBlogs();
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getExcerpt(content: string, maxLength: number = 150): string {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }
}

