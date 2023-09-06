import validator from 'validator';
import _ from 'lodash';

import { getTopicsFields } from '../topics';
import user from '../user';
import plugins from '../plugins';
import { getCategoriesFields } from '../categories';
import * as utils from '../utils';

type topicType = { cid : number, mainPid : number }

type post = {
    uid : number,
    tid : number,
    pid : number,
    user : object,
    handle : object,
    topic : topicType,
    content : string,
    category : object,
    isMainPost : boolean,
    deleted : number | boolean,
    timestampISO : string,
    timestamp : Date
}

type optionType = {
    hasOwnProperty : (key : string) => boolean,
    stripTags : boolean,
    parse : boolean,
    extraFields : string[]
}

type stringDictType = { [field : string] : number }

type topicAndCategoryType = {
    topics : stringDictType [],
    categories : stringDictType []
}

export = function (Posts : {
    getPostSummaryByPids : (pids : number, uid : number, options : optionType) => Promise<post[]>,
    getPostsFields : (pids : number, fields : string []) => Promise<post[]>,
    overrideGuestHandle : (post : post, handle : object) => void,
    parsePost : (post : post) => Promise<post>
}) {
    async function getTopicAndCategories(tids : number[]) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const topicsData : stringDictType [] = await getTopicsFields(tids, [
            'uid', 'tid', 'title', 'cid', 'tags', 'slug',
            'deleted', 'scheduled', 'postcount', 'mainPid', 'teaserPid',
        ]);
        const cids = _.uniq(topicsData.map(topic => topic && topic.cid));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
        const categoriesData : stringDictType [] = await getCategoriesFields(cids, [
            'cid', 'name', 'icon', 'slug', 'parentCid',
            'bgColor', 'color', 'backgroundImage', 'imageClass',
        ]);
        return { topics: topicsData, categories: categoriesData };
    }

    function toObject(key : string, data : { [field : string] : number } []) : { [id : number] : topicType } {
        const obj = {};
        for (let i = 0; i < data.length; i += 1) {
            obj[data[i][key]] = data[i];
        }
        return obj;
    }

    function stripTags(content : string) : string {
        if (content) {
            // eslint-disable-next-line
            return utils.stripHTMLTags(content, utils.stripTags);
        }
        return content;
    }

    async function parsePosts(posts : post[], options : optionType) : Promise<post[]> {
        return await Promise.all(posts.map(async (post) => {
            if (!post.content || !options.parse) {
                post.content = post.content ? validator.escape(String(post.content)) : post.content;
                return post;
            }
            post = await Posts.parsePost(post);
            if (options.stripTags) {
                post.content = stripTags(post.content);
            }
            return post;
        }));
    }

    Posts.getPostSummaryByPids = async function (pids : number, uid : number, options) {
        if (!Array.isArray(pids) || !pids.length) {
            return [];
        }

        options.stripTags = options.hasOwnProperty('stripTags') ? options.stripTags : false;
        options.parse = options.hasOwnProperty('parse') ? options.parse : true;
        options.extraFields = options.hasOwnProperty('extraFields') ? options.extraFields : [];

        const fields = ['pid', 'tid', 'content', 'uid', 'timestamp', 'deleted', 'upvotes', 'downvotes', 'replies', 'handle'].concat(options.extraFields);

        let posts : post [] = await Posts.getPostsFields(pids, fields);
        posts = posts.filter(Boolean);

        // eslint-disable-next-line
        posts = await user.blocks.filter(uid, posts);

        const uids : number[] = _.uniq(posts.map(p => p && p.uid));
        const tids : number[] = _.uniq(posts.map(p => p && p.tid));

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const [users, topicsAndCategories] : [stringDictType [], topicAndCategoryType] = await Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'status']),
            getTopicAndCategories(tids),
        ]);

        const uidToUser = toObject('uid', users);
        const tidToTopic = toObject('tid', topicsAndCategories.topics);
        const cidToCategory = toObject('cid', topicsAndCategories.categories);

        posts.forEach((post) => {
            // If the post author isn't represented in the retrieved users' data,
            // then it means they were deleted, assume guest.
            if (!uidToUser.hasOwnProperty(post.uid)) {
                post.uid = 0;
            }
            post.user = uidToUser[post.uid];
            Posts.overrideGuestHandle(post, post.handle);
            post.handle = undefined;
            post.topic = tidToTopic[post.tid];
            post.category = post.topic && cidToCategory[post.topic.cid];
            post.isMainPost = post.topic && post.pid === post.topic.mainPid;
            post.deleted = post.deleted === 1;
            // eslint-disable-next-line
            post.timestampISO = utils.toISOString(post.timestamp);
        });

        posts = posts.filter(post => tidToTopic[post.tid]);

        posts = await parsePosts(posts, options);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const result : { posts : post[] } = await plugins.hooks.fire('filter:post.getPostSummaryByPids', { posts: posts, uid: uid });
        return result.posts;
    };
}
