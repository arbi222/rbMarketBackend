const checkLoginAllowance = (user) => {
    if (user.accountStatus === "banned") {
        throw new Error("Your account has been permanently banned.");
    }

    return true;
};

module.exports = checkLoginAllowance;