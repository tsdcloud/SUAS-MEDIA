import prisma from '../prisma/client.js';

// export const createParticipant= async(data)=>{
//     if(!data || typeof data !== "object") throw new Error("Invalid data");
//     let{
        // socketId,
        // workshopId,
        // participantId,
        // name,
        // description,
        // avatar,
        // micIsOn,
        // cameraIsOn,
        // handIsRaised,
        // role
//       } = data
//     const workshop = await prisma.workshop.findUnique({
//         where: { workshopId },
//     });

//     if (!workshop) {
//         console.error('WorkShop not found');
//         return
//     }

//     try {
//         const participant = await prisma.participant.create({
//             data:{
                // socketId,
                // cameraIsOn,
                // participantId,
                // avatar,
                // name,
                // description,
                // micIsOn,
                // handIsRaised,
                // role,
                // workshop:{
                //     connect: {workshopId}
                // }
//             }
//         });
//         return participant;
//     } catch (error) {
//         console.log(error)
//         returnError(error.meta, "CREATION");
//     }
// }

export const createParticipant = async (data) => {
    if (!data || typeof data !== "object") throw new Error("Invalid data");

    let {
        socketId,
        workshopId,
        participantId,
        name,
        description,
        avatar,
        micIsOn,
        cameraIsOn,
        handIsRaised,
        role,
        participantOwnerId
    } = data;

    // Vérifier si le workshop existe
    const workshop = await prisma.workshop.findUnique({
        where: { workshopId },
    });

    if (!workshop) {
        console.error('Workshop not found');
        return;
    }

    try {
        // Utiliser upsert pour soit mettre à jour, soit créer le participant
        const participant = await prisma.participant.upsert({
            where: {
                workshop,
                participantId
            },
            update: {
                // Mettre à jour les données existantes et le statut à true
                isActive: true, 
                handIsRaised: false, // Changement du statut de la main à 'false
                cameraIsOn: false, // Changement du statut de la main à 'false'
                socketId
            },
            create: {
                // Créer un nouveau participant s'il n'existe pas encore
                socketId,
                cameraIsOn,
                participantId,
                avatar,
                name,
                description,
                micIsOn,
                handIsRaised,
                role,
                workshop:{
                    connect: {workshopId}
                },
                participantOwnerId
            }
        });
        
        return participant;
    } catch (error) {
        console.log(error);
        return returnError(error.meta, "CREATION");
    }
};


export const updateParticipant= async (id, data)=>{
    
    if(!id || typeof id != "string") throw new Error("Invalid id");
    if(!data || typeof data != "object") throw new Error("Invalid data");

    try {
        const participant = await prisma.participant.update({
            where: {
                participantId: id
            },
            data
        });
        return participant;
    } catch (error) {
        return returnError(error, "UPDATE");
    }
}

export const updateParticipants = async ()=>{
    
    // if(!id || typeof id != "string") throw new Error("Invalid id");

    try {
        await prisma.participant.updateMany({
            data: { micIsOn: false }
        });

        const participantWithMicOff = await prisma.participant.findMany({});
        return participantWithMicOff;
    } catch (error) {
        return returnError(error, "UPDATE ALL PARTICIPANT");
    }
}

export const getAllParticipant= async(id, data)=>{
    if(!data || typeof data != "object") throw new Error("Invalid data");
    if(!id || typeof data != "string") throw new Error("Invalid data");
    try {
        const participant = await prisma.participant.findMany({});
        return participant;
    } catch (error) {
        returnError(error, "GET ALL");
    }
}

export const getParticipantById = async(id)=>{
    if(!id || typeof id != "string") throw new Error("Invalid id");
    try {
        const participant = await prisma.participant.findUnique({
            where: {
                participantId: id
            } 
        });
        return participant;
    } catch (error) {
        returnError(error, "GET PARTICIPANT BY ID");
    }
}

export const getParticipantByWorkshop= async(workshopId)=>{
    if(!workshopId || typeof workshopId != "string") throw new Error("Invalid data");
    try {
        const participants = await prisma.participant.findMany({
            where: {workshopId, isActive:true}
            // where: {workshopId, isActive:true}
        });
        return participants;
    } catch (error) {
        returnError(error, "GET BY FK");
    }
}

export const deleteParticipant=async(socketId)=>{
    try {
        let participant = await prisma.participant.delete(
           {
            where:{socketId}
           }
        )
        return participant
    } catch (error) {
        console.log(error)
        return returnError(error, "DELETE")
    }
}

export const deactivateParticipant = async (socketId) => {
    try { 
        let participant = await prisma.participant.update({
            where: { socketId },
            data: {
                isActive: false, // Changement du statut du participant à 'false'
            },
        });
        return participant;
    } catch (error) {
        console.log(error);
        return returnError(error, "UPDATE");
    } 
};




const returnError=(error, type)=>{
    return {
        error, type
    }
}
