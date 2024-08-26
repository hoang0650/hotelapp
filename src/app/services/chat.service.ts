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

  joinGroup(groupId: string): void {
    this.socket.emit('joinGroup', groupId);
  }

  sendMessage(message: any): void {
    this.socket.emit('sendMessage', message);
  }

  sendImage(imageData: any): void {
    this.socket.emit('sendImage', imageData);
  }

  receiveMessages(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('receiveMessage', (message) => {
        observer.next(message);
      });
    });
  }

  receiveImages(): Observable<any> {
    return new Observable((observer) => {
      this.socket.on('receiveImage', (imageData) => {
        observer.next(imageData);
      });
    });
  }

  getMessages(groupId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/messages/${groupId}`);
  }
}