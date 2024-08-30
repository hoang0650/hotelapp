import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private socket: Socket;
  private baseUrl: string = 'http://localhost:3000';

  constructor(private http: HttpClient) {
    this.socket = io(this.baseUrl);
  }

  // Tham gia vào một nhóm chat
  joinGroup(groupId: string): void {
    this.socket.emit('joinGroup', groupId);
  }

  // Gửi tin nhắn văn bản
  sendMessage(groupId: string, message: any): void {
    this.socket.emit('sendMessage', { ...message, groupId });
  }

  // Gửi hình ảnh
  sendImage(groupId: string, imageData: any): void {
    this.socket.emit('sendImage', { ...imageData, groupId });
  }

  // Nhận tin nhắn từ server
  receiveMessages(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('receiveMessage', (message) => {
        observer.next(message);
      });
    });
  }

  // Nhận hình ảnh từ server
  receiveImages(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('receiveImage', (imageData) => {
        observer.next(imageData);
      });
    });
  }

  // Lấy lịch sử tin nhắn từ server
  getMessages(groupId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/chats/${groupId}`);
  }
}
