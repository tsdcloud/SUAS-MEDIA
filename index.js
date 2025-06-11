import express from 'express';
import http from 'http';
// import https from 'https';
import fs from 'fs';
import path from 'path';
import { Server } from 'socket.io';
import dotenv from 'dotenv'
import mediasoup from 'mediasoup';
import { createWorkShop } from './services/WorkShop.js';
import { createParticipant, deleteParticipant, getParticipantById, getParticipantByWorkshop, updateParticipant, deactivateParticipant, updateParticipants } from './services/Participant.js';
import { getMessageByWorkshop, createMessage } from './services/Message.js';
import prisma from './prisma/client.js';

dotenv.config();

const app = express();
const __dirname = path.resolve();

// SSL cert for HTTPS access
const options = {
  key: fs.readFileSync('cert/cert.key', 'utf-8'),
  cert: fs.readFileSync('cert/cert.crt', 'utf-8')
}

// const httpsServer = https.createServer(options, app);
const httpServer = http.createServer(options, app);
httpServer.listen(process.env.PORT || 5000, process.env.IP, () => {
  console.log('Listening on port 5000');
});

const allowedOrigins = [
  'https://suas.bfcgroupsa.com',
  'https://suas.api.bfcgroupsa.com',
  'https://suas.media.bfcgroupsa.com'
];

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT']
  }
});

// Global state
let db = [];
let messages = [];
let worker;
let rooms = {}; 
let roomsList = {}; // { roomName1: { Router, peers: [socketId1, ...] }, ... }
let peers = {}; // { socketId1: { roomName1, socket, transports = [id1, id2], producers = [id1, id2], consumers = [id1, id2], peerDetails }, ... }
let transports = []; // [ { socketId1, roomName1, transport, consumer }, ... ]
let producers = []; // [ { socketId1, roomName1, producer }, ... ]
let consumers = []; // [ { socketId1, roomName1, consumer }, ... ]

let onlineUsers = []

let participantIds = [];

let chatGroup = [];


const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    payloadType: 111,
    parameters: {
      useinbandfec: 1,
      minptime: 10,
      maxplaybackrate: 48000,
      stereo: 1,
      "sprop-stereo": 1
    }
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
      'x-google-min-bitrate': 500,
      'x-google-max-bitrate': 3000
    },
  },
  {
    kind: 'video',
    mimeType: 'video/h264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1
    }
  }
];

const createWorker = async () => {
  // worker = await mediasoup.createWorker({
  //   rtcMinPort: 2000,
  //   rtcMaxPort: 2999,
  //   logLevel: 'debug',  // Or 'warn', 'error', etc.
  //   logTags: ['ice', 'dtls', 'rtp', 'sctp']
  // });
  worker = await mediasoup.createWorker({
    rtcMinPort: 2000,
    rtcMaxPort: 2999,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
    rtcAnnouncedIp: process.env.IP,
    workerSettings: {
      logLevel: 'warn',
      rtcMinPort: 2000,
      rtcMaxPort: 2999,
    }
  });
  console.log(`Worker PID: ${worker.pid}`);

  worker.on('died', () => {
    console.error('Mediasoup worker has died');
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
};

// Initialize worker
createWorker().catch(error => {
  console.error('Failed to create worker:', error);
  process.exit(1);
});

io.on('connection', async socket => {
  console.log("New user connected :",socket.id);
  socket.emit('connection-success', { socketId: socket.id });

  // socket.emit('getUserChat', participantIds);

  // Called whenever a user joins a room
  socket.on('joinRoom', async ({ user }, callback) => {
    let { id, token, roomId } = user;
   
    let userInfo = { ...user, socketId: socket.id };

    // Join the room
    socket.join(roomId);
    console.log("user a rejoint la reunion :", roomId)

    // onlines users
    const participantId = user.participantId
    !onlineUsers.some(user => user.participantId === participantId) &&
    onlineUsers.push({
        participantId,
        socketId: socket.id,
    })
    console.log("Online(s) user: ", onlineUsers)

    // Create room if not existing
    let data = {
      workshopId: roomId
    }
    const room = await createWorkShop(data);


    // Create user and add to room if not yet in room
    
    if(room){
      let userData={
        socketId :socket.id,
        workshopId :room.workshopId,
        participantId: user.participantId,
        participantOwnerId: user.participantOwnerId,
        name: user.name,
        description: user.description,
        avatar: user.avatar,
        micIsOn: user.micStatus,
        // cameraIsOn: user.cameraStatus,
        cameraIsOn: false,
        handIsRaised:user.handStatus,
        role:user.role
      }

      console.log("new user joined", userData)

      await createParticipant(userData);
      let messages = await getMessageByWorkshop(room.workshopId)
      let participants = await getParticipantByWorkshop(room.workshopId);

      if(participants){
        socket.emit("join-success", { db: participants, messages });
      }

      // Update the user list for the room
      if (!roomsList[roomId]) {
          roomsList[roomId] = [];
      }
      roomsList[roomId].push(userInfo);
  
      // Broadcast the updated user list to all users in the room
      io.to(roomId).emit('updateUserList', participants);
  
      // Handle room-related logic
      updateRoomCount(roomId);
  
      // Create router and update peer details
      let router = await createRoom(roomId, socket.id);

      peers[socket.id] = {
          socket,
          roomId,
          transports: [],
          producers: [],
          consumers: [],
          peerDetails: {
              name: '',
              isAdmin: false,
          },
      };
      console.log('155: ', peers);
  
      const rtpCapabilities = router.rtpCapabilities;
      callback({ rtpCapabilities });

    }

});

  // When ever a user clicks on leave room
  socket.on('leave-room', (roomId) => {
    let {id} = socket;
    // let user = roomsList[roomId].filter(user=>user.socketId !== id);
    // roomsList[roomId] = user;
    // io.to(roomId).emit('updateUserList', roomsList[roomId]);
    socket.leave(roomId);
    let participant = deactivateParticipant(id);
  
    socket.emit("user-left", {id});
    updateRoomCount(roomId);
  });

  // Send Message
  socket.on("send-message", async (data)=>{  
    let newMessage = {
      workshopId: data.roomName,
      senderId: data.participantId,
      content: data.message,
      type: data.type,
    }

    const message = await createMessage(newMessage) 

    // console.log("this is the new message", newMessage);
    // console.log("this is the all the message", message);
    // messages.push(newMessage);

    io.in(data.roomName).emit("new-message", message); 

    socket.broadcast.to(data.roomName).emit('getNotification', {
            message: message,
            isRead: false,
          });

    // onlineUsers.forEach((user) => {
    //   if(data.participantId !== user.participantId){
    //     io.to(user.socketId).emit("getNotification",{
    //       message: message,
    //       isRead: false,
    //     })
    //   }
    // })
  }); 

  // Fonction pour vérifier si un socket est déjà dans le chatGroup
  // const isInChatGroup = (socketId) => {
  //   return chatGroup.some((participant) => participant.socketId === socketId);
  // };
  
  // // Lorsqu'un utilisateur rejoint un groupe de chat
  // socket.on("joinChatGroup", (groupName) => {
  //   const socketIdToCheck = socket.id
  //   // Vérifie si l'utilisateur est déjà dans le room qu'il rejoin
  //   const roomSockets = io.sockets.adapter.rooms.get(groupName);
    
  //   if (roomSockets && roomSockets.has(socketIdToCheck)) {
  //     console.log(`Le socket ${socketIdToCheck} est dans le room ${groupName}`);

  //     if (!isInChatGroup(socket.id)) {
  //       chatGroup.push({ socketId: socket.id, group: groupName });
  //       console.log(`User ${socket.id} joined chat group: ${groupName}`);

  //       io.to(groupName).emit('getUsersInChat', chatGroup)

  //     } else {
  //       console.log(`User ${socket.id} is already in chat group: ${groupName}`);
  //     }

  //     console.log("Current chatGroup members:", chatGroup);
  //   } else {
  //       console.log(`Le socket ${socketIdToCheck} n'est pas dans le room ${groupName}`);
  //   }
    
  // });

  // L'utilisateur quitte le groupe de chat
  socket.on("leaveChatGroup", (groupName) => {
    // Retirer l'utilisateur du chatGroup
    chatGroup = chatGroup.filter((participant) => participant.socketId !== socket.id);
    console.log(`User ${socket.id} left chat group`);

    io.to(groupName).emit('getUsersInChat', chatGroup)

    // Afficher la liste actuelle des membres du chatGroup
    console.log("Current chatGroup members:", chatGroup);
  });

//  // Ajout d'un participantId
//   socket.on("addToChat", (participantId) => {

//     if (!participantIds.includes(participantId)) {
//       participantIds.push(participantId);
//       io.emit("getUserChat", participantIds); // Diffuser la mise à jour
//     }
//   })

//  // Suppression d'un participantId
//   socket.on("removeToChat", (participantId) => {
//     participantIds = participantIds.filter(id => id !== participantId);
//     io.emit("removeUserChat", participantIds)
//   })


  socket.on("hand-up", async userId=>{
    let participant = await getParticipantById(userId);
    // Check if the use exist
    if(participant){
      // Change the participant hand raised status
      let handStatus = !participant.handIsRaised
      let roomId = participant.workshopId;

      // Update participant name
      let updated = await updateParticipant(
        participant.participantId,
        {handIsRaised:handStatus}
      );

      
      // Get the meeting participants
      let participants = await getParticipantByWorkshop(roomId);
      io.to(roomId).emit('updateUserList', participants);
    }
    // if(!user.error){
    //   let participants = await getParticipantByWorkshop(user.workshopId)
    //   io.to(roomId).emit('updateUserList', participants);
    // }
    // let room = userRoom(data);
    // let user = room.find(user => user.id === data);
    // let updateHandUp = {...user, handStatus: !user.handStatus}
    // let userIndex = room.indexOf(user);
    // room[userIndex] = updateHandUp;
    

    // socket.emit("hand-lifted", updateHandUp);
  });

  socket.on("toggle-user-mic", async data=>{
    let participant = await getParticipantById(data);

    // desable all the participants mic status
    let participantMuted = await updateParticipants()
    io.to(participant.workshopId).emit("toggleMicParticipants", participantMuted)

    if(participant){
      // Change the participant hand raised status
      let micStatus = !participant.micIsOn
      let roomId = participant.workshopId;

      // Update participant name
      let updated = await updateParticipant(
        participant.participantId,
        {micIsOn:micStatus}
      );
      // Get the meeting participants
      let participants = await getParticipantByWorkshop(roomId);
      io.to(roomId).emit('updateUserList', participants);
      io.to(roomId).emit("mic-toggled", updated);
    }
  });

  socket.on("toggle-user-camera", async userId=>{
    // Get the user participant ID
    let participant = await getParticipantById(userId);

    // Check if the use exist
    if(participant){
      // Change the participant hand raised status
      let cameraStatus = !participant.cameraIsOn
      let roomId = participant.workshopId;

      // Update participant name
      let updated = await updateParticipant(
        participant.participantId,
        {cameraIsOn:cameraStatus}
      );

      // Get the meeting participants
      let participants = await getParticipantByWorkshop(roomId);
      io.to(roomId).emit('updateUserList', participants);
      io.to(roomId).emit("camera-toggled", updated);
      // socket.emit("hand-lifted", updated);
    }
  });

  // get writter
  socket.on("emitWriter", async data=>{
    socket.broadcast.to(data.roomId).emit("getWriter", data)
  })

  // off writter
  socket.on("offWriter", async data=>{
    socket.broadcast.to(data.roomId).emit("getOffWriter")
  })

  const removeItems = (items, socketId, type) => {
    items.forEach(item => {
      if (item.socketId === socketId) {
        item[type].close();
      }
    });
    return items.filter(item => item.socketId !== socketId);
  };

  socket.on('disconnect', async() => {
    console.log('Peer disconnected:', socket.id);
    let {id} = socket;
    try{
      let participant = await prisma.participant.findUnique({
        where:{
          socketId: id
        }
      });

      if(participant){
        console.log('286 :',participant);
        // let deletedparticipant = await deactivateParticipant(id);
        await deactivateParticipant(id);
        let participants = await getParticipantByWorkshop(participant.workshopId);
        io.to(participant.workshopId).emit('updateUserList', participants);
        // Broadcast the updated user list to all users in the room
        console.log(participants);
        // Remove the user from the peers list
        delete peers[participant.socketId]; 
    
        // Update the room count if needed
        updateRoomCount(participant.workshopId); 
  
        // Leave the room
        socket.leave(participant.workshopId);
      }

      // let roomId;
      // let userInfo;
  
      // for (let [key, users] of Object.entries(roomsList)) {
      //     userInfo = users.find(user => user.socketId === socket.id);
      //     if (userInfo) {
      //         roomId = key;
      //         break;
      //     }
      // }
  
      // if (roomId && userInfo) {
      //   // Remove the user from the room's user list
      //   roomsList[roomId] = roomsList[roomId].filter(user => user.socketId !== socket.id);
  
      //   // Broadcast the updated user list to all users in the room
      //   io.to(roomId).emit('updateUserList', roomsList[roomId]);
  
      //   // Remove the user from the peers list
      //   delete peers[socket.id];
  
      //   // Update the room count if needed
      //   updateRoomCount(roomId);
  
      //   // Leave the room
      //   socket.leave(roomId);
      // }
  
      socket.emit("user-left", {id});
  
      consumers = removeItems(consumers, socket.id, 'consumer');
      producers = removeItems(producers, socket.id, 'producer');
      transports = removeItems(transports, socket.id, 'transport');
      delete peers[socket.id];
    }catch(err){
      console.log(err);
    }
  });

  

  const createRoom = async (roomName, socketId) => {
    let router;
    if (rooms[roomName]) {
      router = rooms[roomName].router;
    } else {
      router = await worker.createRouter({ mediaCodecs });
      rooms[roomName] = { router, peers: [] };
    }
    rooms[roomName].peers.push(socketId);
    console.log(`Router ID: ${router.id}, Peers Count: ${rooms[roomName].peers.length}`);
    return router;
  };

  socket.on('createWebRtcTransport', async ({ consumer }, callback) => {
    const roomName = peers[socket.id].roomId;
    const router = rooms[roomName].router;

    try {
      const transport = await createWebRtcTransport(router);
      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        },
      });
      addTransport(transport, roomName, consumer);
    } catch (error) {
      console.error('Failed to create WebRTC transport:', error);
    }
  });

  const addTransport = (transport, roomName, consumer) => {
    transports.push({ socketId: socket.id, transport, roomName, consumer });
    peers[socket.id].transports.push(transport.id);
  };

  const addProducer = (producer, roomName) => {
    producers.push({ socketId: socket.id, producer, roomName });
    peers[socket.id].producers.push(producer.id);
  };

  const addConsumer = (consumer, roomName) => {
    consumers.push({ socketId: socket.id, consumer, roomName });
    peers[socket.id].consumers.push(consumer.id);
  };

  socket.on('getProducers', callback => {
    const { roomName } = peers[socket.id];
    const producerList = producers
      .filter(producerData => producerData.socketId !== socket.id && producerData.roomName === roomName)
      .map(producerData => producerData.producer.id);
    callback(producerList);
  });

  const informConsumers = (roomName, socketId, id) => {
    producers
      .filter(producerData => producerData.socketId !== socketId && producerData.roomName === roomName)
      .forEach(producerData => {
        const producerSocket = peers[producerData.socketId].socket;
        producerSocket.emit('new-producer', { producerId: id });
      });
  };

  const getTransport = (socketId) => {
    return transports.find(transport => transport.socketId === socketId && !transport.consumer)?.transport;
  };

  socket.on('transport-connect', async ({ dtlsParameters }) => {
    const transport = getTransport(socket.id);
    if (transport && !transport.isConnected) {
      await transport.connect({ dtlsParameters });
    }
  });

  socket.on('transport-produce', async ({ kind, rtpParameters, appData }, callback) => {
    try {
      const transport = getTransport(socket.id);
      if (transport) {
        const producer = await transport.produce({ kind, rtpParameters });
        const { roomName } = peers[socket.id];
        addProducer(producer, roomName);
        informConsumers(roomName, socket.id, producer.id);

        producer.on('transportclose', () => {
          console.log('Transport for producer closed');
          producer.close();
        });

        callback({
          id: producer.id,
          producersExist: producers.length > 1,
        });
      }
    } catch (error) {
      console.error('Failed to produce:', error);
    }
  });

  socket.on('transport-recv-connect', async ({ dtlsParameters, serverConsumerTransportId }) => {
    try {
      const consumerTransport = transports.find(transportData => transportData.consumer && transportData.transport.id === serverConsumerTransportId)?.transport;
      if (consumerTransport) {
        await consumerTransport.connect({ dtlsParameters });
      }
    } catch (error) {
      console.error('Failed to connect consumer transport:', error);
    }
  });


  socket.on('consume', async ({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) => {
      try {
      // console.log("peers details :", peers[socket.id]);
      const { roomId } = peers[socket.id];
      // console.log("recipient room :", roomId);
      
      const router = rooms[roomId].router;
      const consumerTransport = transports.find(transportData => transportData.consumer && transportData.transport.id === serverConsumerTransportId)?.transport;

      if (router.canConsume({ producerId: remoteProducerId, rtpCapabilities })) {
        const consumer = await consumerTransport.consume({
          producerId: remoteProducerId,
          rtpCapabilities,
          paused: true,
        });

        consumer.on('transportclose', () => {
          console.log('Transport for consumer closed');
        });

        consumer.on('producerclose', () => {
          console.log('Producer of consumer closed');
          socket.emit('producer-closed', { remoteProducerId });
          consumerTransport.close();
          transports.splice(transports.findIndex(transportData => transportData.transport.id === consumerTransport.id), 1);
          consumer.close();
          consumers.splice(consumers.findIndex(consumerData => consumerData.consumer.id === consumer.id), 1);
        });

        addConsumer(consumer, roomId);

        callback({
          params: {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          },
        });
      }
    } catch (error) {
      console.log(error.message)
      callback({ params: { error: error.message } });
    }
  });

  socket.on('consumer-resume', async ({ serverConsumerId }) => {
    try {
      const consumerData = consumers.find(consumerData => consumerData.consumer.id === serverConsumerId);
      if (consumerData) {
        await consumerData.consumer.resume();
      }
    } catch (error) {
      console.error('Failed to resume consumer:', error);
    }
  });


  // Update the number of room members
  function updateRoomCount(roomId) {
    const room = io.sockets.adapter.rooms.get(roomId);
    const count = room ? room.size : 0;
    console.log(`Room:${roomId} has ${count} members`);
    io.to(roomId).emit('roomCount', count);
  }

  // Get user room
  const userRoom=(id)=>{
    let roomId;
    let userInfo;
  
    for (let [key, users] of Object.entries(roomsList)) {
        userInfo = users.find(user => user.id == id);
        
        if (userInfo) {
            roomId = key;
            break;
        }
    }
    return roomsList[roomId];
  }

});

const createWebRtcTransport = async (router) => {
  try {
    // const webRtcTransportOptions = {
    //   listenIps: [{ ip: process.env.IP }],
    //   enableUdp: true,
    //   enableTcp: true,
    //   preferUdp: true,
    // }; 
    const webRtcTransportOptions = {
      listenIps: [{ ip: process.env.IP }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 1000000,
      minimumAvailableOutgoingBitrate: 600000,
      maxSctpMessageSize: 262144,
      enableSctp: true,
      numSctpStreams: { OS: 1024, MIS: 1024 },
    };

    const transport = await router.createWebRtcTransport(webRtcTransportOptions);
    console.log(`Transport created with ID: ${transport.id}`);

    transport.on('dtlsstatechange', dtlsState => { 
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    transport.on('close', () => {
      console.log('Transport closed');
    });

    return transport;
  } catch (error) {
    console.error('Failed to create WebRTC transport:', error);
    throw error;
  }
};
