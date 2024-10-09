import { Component, OnInit } from '@angular/core';
import { ChatService } from '../../services/chat.service';

interface Friend {
  id: number;
  name: string;
  avatar: string;
  online: boolean;
}

interface Message {
  user: string;
  text?: string;
  imageUrl?: string;
  timestamp: Date; // Thêm trường thời gian
}

interface Group {
  id: string;
  name: string;
  members: Friend[];
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit {
  friends: Friend[] = [
    { id: 1, name: 'Alice', avatar: 'assets/alice.jpg', online: true },
    { id: 2, name: 'Bob', avatar: 'assets/bob.jpg', online: true },
  ];

  groups: Group[] = [
    { id: '1', name: 'Group 1', members: [this.friends[0], this.friends[1]] },
  ];

  messages: string[] = [];
  selectedFriend: Friend | null = null;
  selectedGroup: Group | null = null;
  newMessage: string = '';

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    // Lắng nghe tin nhắn từ server
    this.chatService.onMessage((msg: string) => {
      this.messages.push(msg);
    });
    // Lắng nghe hình ảnh từ server và cập nhật vào giao diện
    // this.chatService.receiveImages().subscribe((imageData) => {
    //   this.messages.push(imageData);
    // });
  }

  // Chọn một người bạn để chat riêng
  selectFriend(friend: Friend) {
    this.selectedFriend = friend;
    this.selectedGroup = null;
    // Giả sử việc tải tin nhắn giữa 2 người bạn từ API
    this.messages = [
      // { user: friend.name, text: 'Hey!', timestamp: new Date() },
      // { user: 'You', text: 'Hello!', timestamp: new Date() }
      // Thêm các tin nhắn khác nếu có
    ];
  }

  // Chọn một nhóm để tham gia chat
  selectGroup(group: Group) {
    this.selectedGroup = group;
    this.selectedFriend = null;
    
    // Tham gia vào nhóm
    this.chatService.joinGroup(group.id);

    // Tải tin nhắn của nhóm từ API
    this.chatService.getMessages(group.id).subscribe((msgs) => {
      this.messages = msgs;
    });
  }

  // Gửi tin nhắn
  sendMessage() {
    if (this.newMessage.trim()) {
      this.chatService.sendMessage(this.newMessage);
      this.newMessage = '';
    }
  }

  // Gửi hình ảnh
  sendImage(event: any): void {
    const file = event.target.files[0];
    if (file && this.selectedGroup) {
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = {
          user: 'You',
          imageUrl: reader.result as string,
          timestamp: new Date()
        };

        // Gửi hình ảnh đến server
        this.chatService.sendImage(this.selectedGroup!.id, imageData);

        // Cập nhật giao diện với hình ảnh mới
        // this.messages.push(imageData);
      };
      reader.readAsDataURL(file);
    }
  }
}
