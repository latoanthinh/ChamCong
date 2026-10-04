const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();

const adminEmail = 'admin@gmail.com';

exports.deleteEmployeeAccount = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async request => {
    const callerEmail = String(request.auth?.token?.email || '').toLowerCase();
    if (!request.auth || callerEmail !== adminEmail) {
        throw new HttpsError('permission-denied', 'Only the administrator may delete employee accounts.');
    }

    const uid = typeof request.data?.uid === 'string' ? request.data.uid.trim() : '';
    if (!uid || uid === request.auth.uid) {
        throw new HttpsError('invalid-argument', 'A valid employee UID is required.');
    }

    const firestore = getFirestore();
    const auth = getAuth();
    const profileRef = firestore.collection('users').doc(uid);
    const profileSnapshot = await profileRef.get();
    let authUser = null;
    try {
        authUser = await auth.getUser(uid);
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
    }

    if (!profileSnapshot.exists && !authUser) {
        throw new HttpsError('not-found', 'Employee account was not found.');
    }
    if (String(authUser?.email || profileSnapshot.data()?.email || '').toLowerCase() === adminEmail) {
        throw new HttpsError('permission-denied', 'The administrator account cannot be deleted here.');
    }

    try {
        await auth.deleteUser(uid);
    } catch (error) {
        if (error.code !== 'auth/user-not-found') throw error;
    }
    await firestore.recursiveDelete(profileRef);

    try {
        await firestore.collection('auditLogs').add({
            action: 'DELETE_EMPLOYEE_ACCOUNT',
            employeeUid: uid,
            email: authUser?.email || profileSnapshot.data()?.email || '',
            displayName: profileSnapshot.data()?.displayName || '',
            deletedBy: request.auth.uid,
            deletedAt: new Date()
        });
    } catch (error) {
        console.error('Employee was deleted but audit logging failed.', error);
    }

    return { uid, deleted: true };
});