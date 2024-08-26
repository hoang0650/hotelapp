import { Component } from '@angular/core';
import { ChatService } from '../../services/chat.service';
interface Friend {
  id: number;
  name: string;
  avatar: string;
  online: boolean;
}

interface Message {
  user: string;
  text: string;
}

interface Group {
  id: number;
  name: string;
  members: Friend[];
}

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent {
  friends: Friend[] = [
    { id: 1, name: 'Alice', avatar: 'assets/alice.jpg', online: true },
    { id: 2, name: 'Bob', avatar: 'assets/bob.jpg', online: true },
  ];

  groups: Group[] = [
    { id: 1, name: 'Group 1', members: [this.friends[0], this.friends[1]] },
  ];

  messages: Message[] = [];
  selectedFriend: Friend | null = null;
  selectedGroup: Group | null = null;
  newMessage: string = '';

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    // this.chatService.joinGroup(this.selectedGroup.id);

    // this.chatService.getMessages(this.selectedGroup.id).subscribe((msgs) => {
    //   this.messages = msgs;
    // });

    this.chatService.receiveMessages().subscribe((message) => {
      this.messages.push(message);
    });

    this.chatService.receiveImages().subscribe((imageData) => {
      this.messages.push(imageData);
    });
  }

  selectFriend(friend: Friend) {
    this.selectedFriend = friend;
    this.selectedGroup = null;
    // Load messages for the selected friend
    this.messages = [
      { user: friend.name, text: 'Hey!' },
      { user: 'You', text: 'Hello!' }
      // Thêm tin nhắn khác nếu có
    ];
  }

  selectGroup(group: Group) {
    this.selectedGroup = group;
    this.selectedFriend = null;
    // Load messages for the selected group
    this.messages = [
      { user: group.name, text: 'Welcome to the group!' },
      { user: 'Alice', text: 'Hi everyone!' }
      // Thêm tin nhắn khác nếu có
    ];
  }

  sendMessage() {
    if (this.newMessage.trim()) {
      this.messages.push({
        user: 'You',
        text: this.newMessage
      });
      this.newMessage = '';
    }
  }

  sendImage(event: any): void {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const imageData = {
          user: 'You',
          imageUrl: reader.result as string,
          // groupId: this.selectedGroup.id
        };
        this.chatService.sendImage(imageData);
      };
      reader.readAsDataURL(file);
    }
  }

  
}