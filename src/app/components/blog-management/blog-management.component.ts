import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { BlogService } from '../../services/blog.service';
import { AuthService } from '../../services/auth.service';
import { User } from '../../interfaces/user';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
import { NzUploadFile, NzUploadChangeParam } from 'ng-zorro-antd/upload';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';
import { normalizeBlogImageForSave, resolveBlogImageUrl, rewriteBlogHtmlImageUrls, normalizeBlogHtmlImageUrlsForSave, resolveUploadedMediaUrl, toPortableBlogImageUrl } from '../../helpers/blog-image-url';

export interface BlogSection {
  title: string;
  content: string;
}

export interface Blog {
  _id?: string;
  title: string;
  content: string;
  sections?: BlogSection[];
  excerpt?: string;
  authorId?: string;
  authorName?: string;
  status: 'draft' | 'published';
  featuredImage?: string;
  imageUrl?: string;
  tags?: string[];
  category?: string;
  views?: number;
  likesCount?: number;
  dislikesCount?: number;
  userLiked?: boolean;
  userDisliked?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-blog-management',
  templateUrl: './blog-management.component.html',
  styleUrls: ['./blog-management.component.css']
})
export class BlogManagementComponent implements OnInit {
  blogForm: FormGroup;
  blogs: Blog[] = [];
  editId: string | null = null;
  selectedBlog: Blog | null = null;
  isLoading = false;
  isModalVisible = false;
  currentUser: User | null = null;
  imageUrl: string | ArrayBuffer | null = '';
  fileList: any[] = [];
  apiBaseUrl = environment.apiUrl;
  cdnBaseUrl = (environment as { cdnUrl?: string }).cdnUrl || 'https://cdn.phhotel.vn';
  uploadUrl = `${this.apiBaseUrl}/files/upload-blog-asset`;
  pageIndex = 1;
  pageSize = 10;
  total = 0;
  searchValue = '';
  statusFilter: 'all' | 'draft' | 'published' = 'all';

  /** TinyMCE init — upload API → MinIO CDN (cdn.phhotel.vn). */
  editorInit: Record<string, unknown> = {
    plugins: 'anchor autolink charmap codesample emoticons image link lists media searchreplace table visualblocks wordcount',
    toolbar:
      'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | link image media table | align lineheight | checklist numlist bullist indent outdent | emoticons charmap | removeformat',
    menubar: 'file edit view insert format tools table',
    branding: false,
    promotion: false,
    height: 360,
    image_title: true,
    image_description: true,
    image_dimensions: true,
    automatic_uploads: true,
    images_reuse_filename: false,
    images_file_types: 'jpeg,jpg,jpe,jfi,jif,jfif,png,gif,bmp,webp',
    file_picker_types: 'image',
    paste_data_images: true,
    // Giữ absolute CDN URL trong editor
    relative_urls: false,
    remove_script_host: false,
    convert_urls: true,
    urlconverter_callback: (url: string, _node: string, _onSave: boolean, name: string) => {
      if (!url) {
        return url;
      }
      // Chỉ chuẩn hóa src ảnh / data-mce-src
      if (name === 'src' || name === 'data-mce-src' || !name) {
        return (
          resolveBlogImageUrl(
            normalizeBlogImageForSave(url, this.cdnBaseUrl),
            this.apiBaseUrl,
            this.cdnBaseUrl
          ) || url
        );
      }
      return url;
    },
    images_upload_handler: (blobInfo: { blob: () => Blob; filename: () => string }) =>
      this.uploadTinyMceImage(blobInfo),
    file_picker_callback: (
      callback: (url: string, meta?: { title?: string; alt?: string }) => void,
      _value: string,
      meta: { filetype?: string }
    ) => {
      if (meta?.filetype !== 'image') {
        return;
      }
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          return;
        }
        this.uploadTinyMceImage({
          blob: () => file,
          filename: () => file.name
        })
          .then((url) => callback(url, { title: file.name, alt: file.name }))
          .catch((err) => {
            this.message.error(err?.message || this.translate.instant('BLOG_MANAGEMENT.TINYMCE_UPLOAD_ERROR'));
          });
      };
      input.click();
    },
    setup: (editor: any) => {
      // Khi dán/chèn ảnh: rewrite sang CDN / absolute URL
      editor.on('SetContent ObjectResized', () => {
        const imgs = editor.getBody()?.querySelectorAll?.('img[src]') || [];
        imgs.forEach((img: HTMLImageElement) => {
          const raw = img.getAttribute('src') || '';
          const next = resolveBlogImageUrl(
            normalizeBlogImageForSave(raw, this.cdnBaseUrl),
            this.apiBaseUrl,
            this.cdnBaseUrl
          );
          if (next && next !== raw) {
            img.setAttribute('src', next);
          }
          if (!img.getAttribute('referrerpolicy')) {
            img.setAttribute('referrerpolicy', 'no-referrer');
          }
        });
      });
    }
  };

  get isSuperAdmin(): boolean {
    return this.authService.isSuperAdmin();
  }

  get isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  get canAccess(): boolean {
    return this.isSuperAdmin || this.isAdmin;
  }

  get canDelete(): boolean {
    return this.isSuperAdmin; // Chỉ superadmin mới được xóa
  }

  constructor(
    private fb: FormBuilder,
    private blogService: BlogService,
    public authService: AuthService,
    private message: NzMessageService,
    private modal: NzModalService,
    private http: HttpClient,
    private translate: TranslateService
  ) {
    this.blogForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      content: [''],
      excerpt: ['', [Validators.maxLength(500)]],
      status: ['draft', Validators.required],
      featuredImage: [''],
      imageUrl: [''],
      tags: [[]],
      category: [''],
      sections: this.fb.array([])
    });
  }

  get sections(): FormArray {
    return this.blogForm.get('sections') as FormArray;
  }

  get isEditMode(): boolean {
    return !!this.editId;
  }

  get uploadHeaders(): { [key: string]: string | null } {
    const token = this.authService.getToken();
    const headers: { [key: string]: string | null } = {
      'X-Requested-With': null
    };
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }
    return headers;
  }

  addSection(title = '', content = ''): void {
    const sectionForm = this.fb.group({
      title: [title || ''],
      // Absolute CDN/API URL để TinyMCE preview ảnh đúng khi edit
      content: [
        rewriteBlogHtmlImageUrls(content || '', this.apiBaseUrl, this.cdnBaseUrl),
        Validators.required
      ]
    });
    this.sections.push(sectionForm);
  }

  /**
   * Upload blob/file từ TinyMCE → /files/upload-blog-asset → MinIO CDN URL.
   */
  private uploadTinyMceImage(blobInfo: {
    blob: () => Blob;
    filename: () => string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      const token = this.authService.getToken();
      if (!token) {
        reject(new Error('Chưa đăng nhập — không upload được ảnh'));
        return;
      }

      const formData = new FormData();
      const blob = blobInfo.blob();
      const filename = blobInfo.filename() || `image-${Date.now()}.jpg`;
      formData.append('image', blob, filename);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.uploadUrl);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Upload thất bại (${xhr.status})`));
          return;
        }
        try {
          const response = JSON.parse(xhr.responseText || '{}');
          const absolute = resolveUploadedMediaUrl(response, this.apiBaseUrl, this.cdnBaseUrl);

          if (!absolute) {
            reject(new Error('Server không trả về link ảnh CDN'));
            return;
          }
          // TinyMCE chèn thẳng https://cdn.phhotel.vn/...
          resolve(absolute);
        } catch (e: any) {
          reject(new Error(e?.message || 'Phản hồi upload không hợp lệ'));
        }
      };

      xhr.onerror = () => reject(new Error('Lỗi mạng khi upload ảnh'));
      xhr.send(formData);
    });
  }

  removeSection(index: number): void {
    this.sections.removeAt(index);
  }

  resetForm(): void {
    this.imageUrl = '';
    this.fileList = [];
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      imageUrl: '',
      tags: [],
      category: ''
    });
    // Xóa tất cả sections
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
    this.handleCancel();
  }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.canAccess) {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.NO_ACCESS'));
      return;
    }
    this.loadBlogs();
  }

  loadBlogs(): void {
    this.isLoading = true;
    const query: any = {
      page: this.pageIndex,
      limit: this.pageSize
    };

    if (this.searchValue) {
      query.search = this.searchValue;
    }

    if (this.statusFilter !== 'all') {
      query.status = this.statusFilter;
    }

    this.blogService.getBlogs(query).subscribe({
      next: (response: any) => {
        this.blogs = response.blogs || response.data || [];
        this.total = response.total || 0;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Lỗi khi tải danh sách blog:', error);
        this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.LOAD_ERROR'));
        this.isLoading = false;
      }
    });
  }

  openCreateModal(): void {
    this.editId = null;
    this.selectedBlog = null;
    this.imageUrl = '';
    this.fileList = [];
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      imageUrl: '',
      tags: [],
      category: ''
    });
    // Xóa tất cả sections
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
    // Thêm 1 section mặc định
    this.addSection();
    this.isModalVisible = true;
  }

  openEditModal(blog: Blog): void {
    this.editId = blog._id || null;
    this.selectedBlog = blog;
    // Chuyển tags array thành string để hiển thị trong input
    const tagsString = blog.tags && blog.tags.length > 0 ? blog.tags.join(', ') : '';
    
    // Set imageUrl preview
    const imageUrlValue = blog.imageUrl || blog.featuredImage || '';
    this.imageUrl = imageUrlValue;
    this.fileList = [];
    
    // Xóa tất cả sections cũ
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
    
    // Load sections từ blog hoặc tạo section mặc định từ content
    if (blog.sections && blog.sections.length > 0) {
      blog.sections.forEach((section, index) => {
        this.addSection(
          section.title || `Phần ${index + 1}`,
          section.content || ''
        );
      });
    } else if (blog.content) {
      // Blog cũ chỉ có content: không để title rỗng + required (làm nút Cập nhật bị disabled)
      this.addSection('Nội dung chính', blog.content);
    } else {
      this.addSection();
    }
    
    this.blogForm.patchValue({
      title: blog.title,
      content: blog.content,
      excerpt: blog.excerpt || '',
      status: blog.status,
      featuredImage: blog.featuredImage || '',
      imageUrl: imageUrlValue,
      tags: tagsString,
      category: blog.category || ''
    });
    this.blogForm.updateValueAndValidity({ emitEvent: false });
    this.isModalVisible = true;
  }

  handleCancel(): void {
    this.isModalVisible = false;
    this.editId = null;
    this.selectedBlog = null;
    this.imageUrl = '';
    this.fileList = [];
    this.blogForm.reset({
      title: '',
      content: '',
      excerpt: '',
      status: 'draft',
      featuredImage: '',
      imageUrl: '',
      tags: [],
      category: ''
    });
    // Xóa tất cả sections
    while (this.sections.length !== 0) {
      this.sections.removeAt(0);
    }
  }

  handleOk(): void {
    if (this.blogForm.invalid) {
      this.message.warning(this.translate.instant('BLOG_MANAGEMENT.FILL_REQUIRED'));
      Object.values(this.blogForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
      return;
    }

    const formValue = this.blogForm.value;
    
    // Xử lý tags nếu là string (phân cách bằng dấu phẩy)
    let tagsArray: string[] = [];
    if (formValue.tags) {
      if (typeof formValue.tags === 'string') {
        tagsArray = formValue.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
      } else if (Array.isArray(formValue.tags)) {
        tagsArray = formValue.tags;
      }
    }
    
    // Lấy sections từ formArray — giữ CDN absolute URL khi lưu
    const sections: BlogSection[] = this.sections.controls.map(control => ({
      title: control.get('title')?.value || '',
      content: normalizeBlogHtmlImageUrlsForSave(
        control.get('content')?.value || '',
        this.apiBaseUrl,
        this.cdnBaseUrl
      )
    }));
    
    // Tạo content từ sections (nối tất cả sections lại)
    const contentFromSections = sections.map(s => {
      if (s.title) {
        return `<h2>${s.title}</h2>${s.content}`;
      }
      return s.content;
    }).join('<br><br>');
    
    // Sử dụng content từ sections nếu có, nếu không dùng content cũ
    const rawContent = sections.length > 0 ? contentFromSections : (formValue.content || '');
    const finalContent = normalizeBlogHtmlImageUrlsForSave(
      rawContent,
      this.apiBaseUrl,
      this.cdnBaseUrl
    );
    
    const imageForSave = normalizeBlogImageForSave(
      formValue.imageUrl || formValue.featuredImage,
      this.cdnBaseUrl
    );

    const blogData: Blog = {
      title: formValue.title,
      content: finalContent,
      sections: sections.length > 0 ? sections : undefined,
      excerpt: formValue.excerpt,
      status: formValue.status,
      featuredImage: imageForSave,
      imageUrl: imageForSave,
      tags: tagsArray,
      category: formValue.category
    };

    this.isLoading = true;

    if (this.editId) {
      this.blogService.updateBlog(this.editId, blogData).subscribe({
        next: (updatedBlog) => {
          this.message.success(this.translate.instant('BLOG_MANAGEMENT.UPDATE_SUCCESS'));
          this.loadBlogs();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Lỗi khi cập nhật blog:', error);
          this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.UPDATE_ERROR'));
          this.isLoading = false;
        }
      });
    } else {
      this.blogService.createBlog(blogData).subscribe({
        next: (newBlog) => {
          this.message.success(this.translate.instant('BLOG_MANAGEMENT.CREATE_SUCCESS'));
          this.loadBlogs();
          this.handleCancel();
          this.isLoading = false;
        },
        error: (error) => {
          console.error('Lỗi khi tạo blog:', error);
          this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.CREATE_ERROR'));
          this.isLoading = false;
        }
      });
    }
  }

  deleteBlog(id: string): void {
    if (!this.canDelete) {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.NO_DELETE_PERMISSION'));
      return;
    }

    this.modal.confirm({
      nzTitle: this.translate.instant('BLOG_MANAGEMENT.CONFIRM_DELETE_TITLE'),
      nzContent: this.translate.instant('BLOG_MANAGEMENT.CONFIRM_DELETE_MESSAGE'),
      nzOkText: this.translate.instant('BLOG_MANAGEMENT.DELETE'),
      nzOkType: 'primary',
      nzOkDanger: true,
      nzCancelText: this.translate.instant('COMMON.CANCEL'),
      nzOnOk: () => {
        this.isLoading = true;
        this.blogService.deleteBlog(id).subscribe({
          next: () => {
            this.message.success(this.translate.instant('BLOG_MANAGEMENT.DELETE_SUCCESS'));
            this.loadBlogs();
            this.isLoading = false;
          },
          error: (error) => {
            console.error('Lỗi khi xóa blog:', error);
            this.message.error(error.error?.message || this.translate.instant('BLOG_MANAGEMENT.DELETE_ERROR'));
            this.isLoading = false;
          }
        });
      }
    });
  }

  onSearch(): void {
    this.pageIndex = 1;
    this.loadBlogs();
  }

  onPageChange(page: number): void {
    this.pageIndex = page;
    this.loadBlogs();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.pageIndex = 1;
    this.loadBlogs();
  }

  onStatusFilterChange(status: 'all' | 'draft' | 'published'): void {
    this.statusFilter = status;
    this.pageIndex = 1;
    this.loadBlogs();
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'published':
        return this.translate.instant('BLOG_MANAGEMENT.PUBLISHED');
      case 'draft':
        return this.translate.instant('BLOG_MANAGEMENT.DRAFT');
      default:
        return status;
    }
  }

  getStatusColor(status: string): string {
    switch (status) {
      case 'published':
        return 'success';
      case 'draft':
        return 'default';
      default:
        return 'default';
    }
  }

  formatDate(date: Date | string | undefined): string {
    if (!date) return '-';
    const d = new Date(date);
    return d.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  handleImageChange(info: NzUploadChangeParam): void {
    if (info.file.status === 'uploading') {
      this.isLoading = true;
      return;
    }
    
    if (info.file.status === 'done') {
      // Ưu tiên absolute CDN (https://cdn.phhotel.vn/...)
      if (info.file.response) {
        const response = info.file.response;
        const imageUrl = resolveUploadedMediaUrl(response, this.apiBaseUrl, this.cdnBaseUrl);

        if (!imageUrl) {
          this.message.error(this.translate.instant('BLOG_MANAGEMENT.UPLOAD_NO_CDN_URL'));
          this.isLoading = false;
          return;
        }

        const forSave = toPortableBlogImageUrl(imageUrl, this.apiBaseUrl, this.cdnBaseUrl) || imageUrl;
        this.imageUrl = imageUrl;
        this.blogForm.patchValue({
          imageUrl: forSave,
          featuredImage: forSave
        });
        this.message.success(this.translate.instant('BLOG_MANAGEMENT.UPLOAD_SUCCESS'));
      }
      this.isLoading = false;
    } else if (info.file.status === 'error') {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.UPLOAD_ERROR', {
        message: info.file.error?.message || this.translate.instant('BLOG_MANAGEMENT.UPLOAD_ERROR_UNKNOWN')
      }));
      console.error('Upload error:', info.file.error);
      this.isLoading = false;
    }
  }

  beforeUpload = (file: NzUploadFile): boolean => {
    const isImage = file.type?.startsWith('image/');
    if (!isImage) {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.UPLOAD_IMAGE_ONLY'));
      return false;
    }
    const isLt5M = (file.size || 0) / 1024 / 1024 < 5;
    if (!isLt5M) {
      this.message.error(this.translate.instant('BLOG_MANAGEMENT.UPLOAD_SIZE_LIMIT'));
      return false;
    }
    this.fileList = this.fileList.concat(file);
    return true;
  };

  getImageUrl(urlOrId: string): string {
    return resolveBlogImageUrl(urlOrId, this.apiBaseUrl, this.cdnBaseUrl);
  }

  handleImageError(event: any): void {
    // Nếu ảnh không load được, có thể là imageId cũ hoặc URL không hợp lệ
    console.warn('Image load error:', event);
  }
}

