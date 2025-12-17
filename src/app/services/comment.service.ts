import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Comment {
  _id?: string;
  blogId: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  userAvatar?: string;
  content: string;
  parentCommentId?: string | null;
  likes?: Array<{ userId: string; createdAt: Date }>;
  dislikes?: Array<{ userId: string; createdAt: Date }>;
  likesCount?: number;
  dislikesCount?: number;
  userLiked?: boolean;
  userDisliked?: boolean;
  replies?: Comment[];
  status?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CommentResponse {
  comments: Comment[];
  total: number;
  page: number;
  limit: number;
}

@Injectable({
  providedIn: 'root'
})
export class CommentService {
  private apiUrl = 'https://nest-production-8106.up.railway.app/comments';

  constructor(private http: HttpClient) { }

  getComments(blogId: string, page: number = 1, limit: number = 50): Observable<CommentResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());
    
    return this.http.get<CommentResponse>(`${this.apiUrl}/blog/${blogId}`, { params });
  }

  createComment(blogId: string, content: string, parentCommentId?: string): Observable<Comment> {
    const body: any = { content };
    if (parentCommentId) {
      body.parentCommentId = parentCommentId;
    }
    return this.http.post<Comment>(`${this.apiUrl}/blog/${blogId}`, body);
  }

  likeComment(commentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${commentId}/like`, {});
  }

  dislikeComment(commentId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${commentId}/dislike`, {});
  }

  deleteComment(commentId: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${commentId}`);
  }
}

